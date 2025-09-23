import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

function maskEmail(email: string): string {
  const [name, domain] = String(email).split('@')
  if (!name || !domain) return ''
  const masked = name.length <= 1 ? '*' : name[0] + '*'.repeat(Math.max(1, name.length - 1))
  return `${masked}@${domain}`
}

function hashIp(ip: string | null): string | null {
  if (!ip) return null
  try {
    const data = new TextEncoder().encode(ip)
    // Simple non-crypto hash for lightweight dedupe
    let h = 2166136261 >>> 0
    for (let i = 0; i < data.length; i++) { h ^= data[i]; h = Math.imul(h, 16777619) >>> 0 }
    return h.toString(16)
  } catch (_) { return null }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const url = new URL(req.url)
  const path = url.pathname

  try {
    // GET /leaderboard -> call RPC
    if (req.method === 'GET' && path.includes('/leaderboard')) {
      const limit = parseInt(url.searchParams.get('limit') || '50', 10)
      const { data, error } = await supabase.rpc('get_growth_leaderboard', { limit_rows: isNaN(limit) ? 50 : limit })
      if (error) {
        return new Response(JSON.stringify({ error: 'Failed to load leaderboard' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify(data || []), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // GET /settings
    if (req.method === 'GET' && path.includes('/settings')) {
      const { data: settings } = await supabase
        .from('growth_product_settings')
        .select('system_prompt, provider, model, temperature, max_tokens, enabled')
        .eq('key', 'growth_default')
        .single()
      return new Response(JSON.stringify(settings || {}), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // POST /settings - update prompt/model
    if (req.method === 'POST' && path.includes('/settings')) {
      let body: any
      try { body = await req.json() } catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }) }
      const { system_prompt, provider, model, temperature, max_tokens, enabled } = body || {}
      const payload: any = {}
      if (typeof system_prompt === 'string') payload.system_prompt = system_prompt
      if (typeof provider === 'string') payload.provider = provider
      if (typeof model === 'string') payload.model = model
      if (typeof temperature === 'number') payload.temperature = temperature
      if (typeof max_tokens === 'number') payload.max_tokens = max_tokens
      if (typeof enabled === 'boolean') payload.enabled = enabled
      if (Object.keys(payload).length === 0) {
        return new Response(JSON.stringify({ error: 'No valid fields' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      payload.updated_at = new Date().toISOString()
      const { error } = await supabase
        .from('growth_product_settings')
        .update(payload)
        .eq('key', 'growth_default')
      if (error) return new Response(JSON.stringify({ error: 'Update failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // POST /rate - main entry
    if (req.method === 'POST') {
      let body: any
      try { body = await req.json() } catch (_) {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const { username, email, context, prompt_override, model_override } = body || {}
      const image = body?.image // expect Data URL or base64 payload from client
      if (!username || !email) {
        return new Response(JSON.stringify({ error: 'username and email are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      if (!image || typeof image !== 'string') {
        return new Response(JSON.stringify({ error: 'image is required (data URL/base64)' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      // Load settings
      const { data: settings } = await supabase
        .from('growth_product_settings')
        .select('system_prompt, provider, model, temperature, max_tokens, enabled')
        .eq('key', 'growth_default')
        .single()
      if (!settings?.enabled) {
        return new Response(JSON.stringify({ error: 'Growth product disabled' }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const provider = 'openai'
      const model = model_override || settings?.model || 'gpt-4o'
      const systemPromptBase = prompt_override || settings?.system_prompt || ''

      // Lightweight reasoning from handbooks (answers only)
      let handbookBullets = ''
      try {
        const cues = (String(context || '').toLowerCase().match(/ios|android|mobile|web|navigation|gestures|bars|layout|elevation|motion|usability|heuristics|evaluation|contrast|accessibility|color|forms|onboarding|friction|conversion|a\/?b|growth|metrics|kpi|goals|components|design system|tokens|spacing|typography|grids|product|business|ux/g) || []).slice(0, 6)
        let rows: any[] = []
        if (cues.length > 0) {
          const likeAny = cues.map(c => `%${c}%`)
          const { data } = await supabase
            .from('handbooks')
            .select('handbook_title, content, when_to_use')
            .or(likeAny.map((_,i)=>`when_to_use.ilike.${likeAny[i]}`).join(','))
            .limit(5)
          rows = data || []
        }
        if ((!rows || rows.length === 0) && context) {
          const term = String(context).split(/\s+/).slice(0,3).join(' ')
          const { data } = await supabase
            .from('handbooks')
            .select('handbook_title, content')
            .ilike('content', `%${term}%`)
            .limit(3)
          rows = data || []
        }
        if (rows && rows.length > 0) {
          handbookBullets = rows.map(r => {
            const text = String(r.content || '').replace(/\s+/g,' ').trim().slice(0,180)
            return `- ${text} — [${r.handbook_title}]`
          }).join('\n')
        }
      } catch (_) {}

      // Inspiration shortlist from flows_index (no COMMAND usage)
      let inspiration = ''
      try {
        const { data: rows } = await supabase
          .from('flows_index')
          .select('app, flow, industry, platform, tone, short_desc')
          .eq('is_active', true)
          .neq('app', '')
          .neq('flow', '')
          .order('app', { ascending: true })
          .order('flow', { ascending: true })
          .limit(12)
        const list = (rows || []).slice(0, 8).map(r => `${r.app} ${String(r.flow||'').replace(/^\s*(iOS|Android|Web|Discord)\s+/i,'').trim()} — [${r.industry} | ${r.platform}] — ${r.short_desc}`).join('\n- ')
        if (list) {
          inspiration = `\n\nInspiration (hidden, do not cite as COMMAND):\n- ${list}`
        }
      } catch (_) {}

      // Build final system prompt
      let systemPrompt = systemPromptBase
      if (handbookBullets) {
        systemPrompt += `\n\nHandbook reasoning (hidden):\n${handbookBullets}`
      }
      if (inspiration) { systemPrompt += inspiration }
      systemPrompt += `\n\nHard rules:\n- Output JSON only with keys grade, justification, improvements.\n- No COMMAND lines.\n- improvements must be an array with exactly 2 items.`

      // Convert data URL image for OpenAI
      let imagePart: any = null
      try {
        if (/^data:/i.test(image)) {
          imagePart = { type: 'image_url', image_url: { url: image } }
        } else {
          imagePart = { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}` } }
        }
      } catch (_) {}

      const start = Date.now()
      let aiJSON: { grade: number; justification: string; improvements: string[] } | null = null

      // Call OpenAI
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: [ { type: 'text', text: String(context || 'Rate this design.') }, imagePart ].filter(Boolean) }
      ] as any

      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: Math.min(1500, (settings?.max_tokens || 1200)),
          temperature: settings?.temperature ?? 0.4,
          response_format: { type: 'json_object' }
        })
      })

      if (!resp.ok) {
        const errText = await resp.text()
        return new Response(JSON.stringify({ error: 'Provider error', details: errText }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const data = await resp.json()
      const text = data.choices?.[0]?.message?.content || '{}'
      try { aiJSON = JSON.parse(text) } catch (_) { aiJSON = null }
      if (!aiJSON || typeof aiJSON.grade !== 'number' || !Array.isArray(aiJSON.improvements)) {
        return new Response(JSON.stringify({ error: 'Invalid model output' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      // Clamp and coerce
      const grade = Math.max(0, Math.min(100, Math.round(aiJSON.grade)))
      const improvements = (aiJSON.improvements || []).slice(0,2).map(String)
      while (improvements.length < 2) improvements.push('Add a specific, high‑impact improvement.')
      const justification = String(aiJSON.justification || '').slice(0, 1200)

      // Store image in Storage (flows bucket under growth_uploads/)
      let storagePath = ''
      try {
        const now = new Date()
        const key = `growth_uploads/${now.getUTCFullYear()}/${(now.getUTCMonth()+1).toString().padStart(2,'0')}/${crypto.randomUUID()}.jpg`
        const base64 = String(image).includes(',') ? String(image).split(',')[1] : String(image)
        const bin = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
        const { error: upErr } = await supabase.storage.from('flows').upload(key, bin, { contentType: 'image/jpeg', upsert: false })
        if (!upErr) storagePath = key
      } catch (e) { console.error('Upload error', e) }

      // Persist rating row
      const ip = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || null
      const ipHash = hashIp(ip)
      const latency = Date.now() - start
      await supabase.from('growth_design_ratings').insert({
        username,
        email,
        design_storage_path: storagePath || 'inline',
        input_context: context || null,
        provider,
        model,
        grade,
        justification,
        improvements: JSON.stringify(improvements),
        latency_ms: latency,
        ip_hash: ipHash
      })

      return new Response(JSON.stringify({
        grade,
        justification,
        improvements,
        model,
        latency_ms: latency,
        masked_email: maskEmail(email)
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    console.error('growth function error', e)
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})


