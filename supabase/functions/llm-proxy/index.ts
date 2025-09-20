import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Get the user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const { message, provider, model, temperature, maxTokens, conversation_id } = await req.json()

    if (!message) {
      return new Response(
        JSON.stringify({ error: 'Message is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get app settings
    const { data: settings, error: settingsError } = await supabaseClient
      .from('app_settings')
      .select('system_prompt, provider, model')
      .eq('key', 'default')
      .single()

    if (settingsError) {
      return new Response(
        JSON.stringify({ error: 'Failed to get app settings' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const systemPrompt = settings?.system_prompt || 'You are a helpful AI assistant.'
    const finalProvider = provider || settings?.provider || 'anthropic'
    const finalModel = model || settings?.model || 'claude-3-5-sonnet-20241022'

    // Call the appropriate AI provider
    let aiResponse
    try {
      console.log('Calling AI provider:', finalProvider, finalModel)
      
      if (finalProvider === 'anthropic') {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') || '',
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: finalModel,
            max_tokens: maxTokens || 4000,
            temperature: temperature || 0.7,
            system: systemPrompt,
            messages: [
              {
                role: 'user',
                content: Array.isArray(message) ? message : [{ type: 'text', text: message }]
              }
            ]
          })
        })

        if (!response.ok) {
          const errorData = await response.text()
          throw new Error(`Anthropic API error: ${response.status} ${errorData}`)
        }

        const data = await response.json()
        aiResponse = data.content[0].text

      } else if (finalProvider === 'google') {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${finalModel}:generateContent?key=${Deno.env.get('GOOGLE_API_KEY')}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{
              parts: Array.isArray(message) ? message.map(item => 
                item.type === 'text' ? { text: item.text } : {
                  inline_data: {
                    mime_type: 'image/jpeg',
                    data: item.image_url.url.split(',')[1]
                  }
                }
              ) : [{ text: message }]
            }],
            generationConfig: {
              temperature: temperature || 0.7,
              maxOutputTokens: maxTokens || 4000
            }
          })
        })

        if (!response.ok) {
          const errorData = await response.text()
          throw new Error(`Google API error: ${response.status} ${errorData}`)
        }

        const data = await response.json()
        aiResponse = data.candidates[0].content.parts[0].text

      } else {
        throw new Error(`Unsupported provider: ${finalProvider}`)
      }

    } catch (e) {
      console.error('AI provider error:', e)
      return new Response(
        JSON.stringify({ 
          error: 'AI provider failed', 
          details: e.message,
          provider: finalProvider,
          model: finalModel
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Store messages in database
    if (conversation_id) {
      try {
        // Insert user message
        await supabaseClient
          .from('messages')
          .insert({
            conversation_id,
            user_id: user.id,
            role: 'user',
            content: { 
              type: Array.isArray(message) ? 'multimodal' : 'text', 
              value: message 
            },
            source: 'web',
            is_final: true,
          })

        // Insert assistant response
        await supabaseClient
          .from('messages')
          .insert({
            conversation_id,
            user_id: user.id,
            role: 'assistant',
            content: { 
              type: 'text', 
              value: aiResponse 
            },
            source: 'web',
            is_final: true,
          })
      } catch (dbError) {
        console.error('Database error:', dbError)
        // Continue even if database storage fails
      }
    }

    return new Response(
      JSON.stringify({ 
        response: aiResponse,
        provider: finalProvider,
        model: finalModel
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
