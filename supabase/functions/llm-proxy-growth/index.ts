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
    // GET /user_designs?username=foo — list recent inline images for a username
    if (req.method === 'GET' && path.includes('/user_designs')) {
      const username = url.searchParams.get('username') || ''
      if (!username) {
        return new Response(JSON.stringify({ error: 'username required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const { data, error } = await supabase
        .from('growth_design_images')
        .select('created_at, image_data, rating_id')
        .eq('username', username)
        .order('created_at', { ascending: false })
        .limit(24)
      if (error) {
        return new Response(JSON.stringify({ error: 'Failed to load designs' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      // Enrich with grade when available
      const items = [] as any[]
      for (const it of (data || [])) {
        let grade: number | null = null
        try {
          if (it.rating_id) {
            const { data: r } = await supabase.from('growth_design_ratings').select('grade').eq('id', it.rating_id).single()
            grade = r?.grade ?? null
          }
        } catch (_) {}
        items.push({ created_at: it.created_at, design_storage_path: it.image_data, grade })
      }
      return new Response(JSON.stringify(items), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
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
      // Accept JSON or raw text (raw text treated as full system_prompt)
      let body: any = null
      let systemPromptFromRaw: string | null = null
      try {
        const raw = await req.text()
        try { body = raw ? JSON.parse(raw) : {} } catch { systemPromptFromRaw = raw }
      } catch (_) { body = {} }
      const { system_prompt, provider, model, temperature, max_tokens, enabled } = body || {}
      // Load current to allow partial updates
      const { data: curr } = await supabase
        .from('growth_product_settings')
        .select('system_prompt, provider, model, temperature, max_tokens, enabled')
        .eq('key', 'growth_default')
        .single()

      const payload: any = { key: 'growth_default' }
      const newPrompt = (typeof system_prompt === 'string') ? system_prompt : (typeof systemPromptFromRaw === 'string' && systemPromptFromRaw.trim().length > 0 ? systemPromptFromRaw : undefined)
      if (typeof newPrompt === 'string') payload.system_prompt = newPrompt
      else if (curr?.system_prompt) payload.system_prompt = curr.system_prompt

      if (typeof provider === 'string') payload.provider = provider
      else if (curr?.provider) payload.provider = curr.provider

      if (typeof model === 'string') payload.model = model
      else if (curr?.model) payload.model = curr.model

      if (typeof temperature === 'number') payload.temperature = temperature
      else if (typeof curr?.temperature === 'number') payload.temperature = curr.temperature

      if (typeof max_tokens === 'number') payload.max_tokens = max_tokens
      else if (typeof curr?.max_tokens === 'number') payload.max_tokens = curr.max_tokens

      if (typeof enabled === 'boolean') payload.enabled = enabled
      else if (typeof curr?.enabled === 'boolean') payload.enabled = curr.enabled

      payload.updated_at = new Date().toISOString()
      const { error } = await supabase
        .from('growth_product_settings')
        .upsert(payload, { onConflict: 'key', ignoreDuplicates: false })
      if (error) return new Response(JSON.stringify({ error: 'Save failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
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
      systemPrompt += `\n\nHard rules (strict):\n- Output JSON only with keys: grade, justification, improvements.\n- grade is an integer 0–100.\n- justification MUST follow this exact multiline template with newlines preserved (no extra sections, no bullets unless shown):\n\nProduct: [X] | Industry: [Y] | Platform: [iOS/Android/Web/Desktop]\n\n⭐️ OVERALL DESIGN RATING: X/100 (average of 4 grades below)\n\n⭐️ Visual appeal: X/100\n🔴 or 🟢 1-liner insight\n\n⭐️ Usability: X/100\n🔴 or 🟢 1-liner insight\n\n⭐️ Navigation: X/100\n🔴 or 🟢 1-liner insight\n\n⭐️ Business impact: X/100\n🔴 or 🟢 1-liner insight\n\n⭐️ Most impactful fixes:\n✅ solution 1: …\n✅ solution 2: …\n\nRecommendation: short, no-BS justification\n\n👉 Flows to look at for inspiration → pick 1 flow from flows_index with exact name\n\nPunchline: 1 bold tweet-style hot take\n\n- Use roasty, lowercase tone and emojis as spice; do not greet or explain.\n- Newlines are required exactly as shown above.\n- Do NOT include any line starting with 'COMMAND:'.\n- improvements must be an array with exactly 2 specific, high‑impact items (these mirror the two ✅ lines above).`

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
      let justification = String(aiJSON.justification || '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
      // Keep arrow line on one line
      justification = justification.replace(/\n\s*👉\s*\n\s*Flows to look at for inspiration/g, '\n👉 Flows to look at for inspiration')
      // Ensure blank lines between sections
      justification = justification
        .replace(/(\n⭐️ Visual appeal:[^\n]*\n)([^\n])/g, '$1$2')
        .replace(/(\n⭐️ Usability:[^\n]*\n)([^\n])/g, '$1$2')
        .replace(/(\n⭐️ Navigation:[^\n]*\n)([^\n])/g, '$1$2')
        .replace(/(\n⭐️ Business impact:[^\n]*\n)([^\n])/g, '$1$2')
        .replace(/(\n⭐️ OVERALL DESIGN RATING:[^\n]*\n)(?!\n)/g, '$1')
      // Single blank line before each major section label
      justification = justification
        .replace(/\n(⭐️ Visual appeal:)/g, '\n\n$1')
        .replace(/\n(⭐️ Usability:)/g, '\n\n$1')
        .replace(/\n(⭐️ Navigation:)/g, '\n\n$1')
        .replace(/\n(⭐️ Business impact:)/g, '\n\n$1')
        .replace(/\n(⭐️ Most impactful fixes:)/g, '\n\n$1')
        .replace(/\n(Recommendation:)/g, '\n\n$1')
        .replace(/\n(👉 Flows to look at for inspiration)/g, '\n\n$1')
        .replace(/\n(Punchline:)/g, '\n\n$1')
      justification = justification.trim().slice(0, 2000)

      // Persist rating row
      const ip = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || null
      const ipHash = hashIp(ip)
      const latency = Date.now() - start
      const { data: ins, error: insertError } = await supabase.from('growth_design_ratings').insert({
        username,
        email,
        design_storage_path: null,
        input_context: context || null,
        provider,
        model,
        grade,
        justification,
        improvements: JSON.stringify(improvements),
        latency_ms: latency,
        ip_hash: ipHash
      }).select('id').single()
      if (insertError) {
        console.error('Insert rating error:', insertError)
      }

      // Store image separately to avoid oversized rows
      try {
        const trimmed = typeof image === 'string' && image.length > 1200000 ? image.slice(0, 1200000) : image
        await supabase.from('growth_design_images').insert({
          rating_id: ins?.id || null,
          username,
          email,
          image_data: trimmed
        })
      } catch (e) { console.error('Insert image error:', e) }

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


