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
    // Create Supabase client with service role key
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Skip user authentication for now - using service role
    const user = { id: 'service-user' }

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
    const finalProvider = provider || settings?.provider || 'openai'
    const finalModel = model || settings?.model || (provider === 'anthropic' ? 'claude-3-5-sonnet-20240620' : 'gpt-4o')

    // Search knowledge base for relevant documents from flows bucket
    let relevantDocs = []
    try {
      const { data: files, error: storageError } = await supabaseClient.storage
        .from('flows')
        .list('', { limit: 100 })
      
      if (storageError) {
        console.error('Storage error:', storageError)
      } else if (files) {
        // Search through file names and metadata for relevant documents
        const searchTerm = message.toString().toLowerCase()
        relevantDocs = files.filter(file => 
          file.name.toLowerCase().includes(searchTerm) ||
          (file.metadata && JSON.stringify(file.metadata).toLowerCase().includes(searchTerm))
        ).slice(0, 5)
      }
    } catch (error) {
      console.error('Knowledge base search error:', error)
    }

    // Enhance system prompt with knowledge base context
    let enhancedSystemPrompt = systemPrompt
    if (relevantDocs.length > 0) {
      const knowledgeContext = relevantDocs.map(doc => 
        `Document: ${doc.name}\nType: ${doc.metadata?.mimetype || 'unknown'}\nSize: ${doc.metadata?.size || 'unknown'} bytes\n`
      ).join('\n')
      enhancedSystemPrompt += `\n\nRelevant knowledge base documents:\n${knowledgeContext}`
    }

    // Call the appropriate AI provider
    let aiResponse
    try {
      console.log('Calling AI provider:', finalProvider, finalModel)
      
      if (finalProvider === 'openai') {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: finalModel,
            messages: [
              { role: 'system', content: enhancedSystemPrompt },
              { role: 'user', content: Array.isArray(message) ? message : [{ type: 'text', text: message }] }
            ],
            max_tokens: maxTokens || 4000,
            temperature: temperature || 0.7
          })
        })

        if (!response.ok) {
          const errorData = await response.text()
          throw new Error(`OpenAI API error: ${response.status} ${errorData}`)
        }

        const data = await response.json()
        aiResponse = data.choices[0]?.message?.content || 'No response generated'

      } else if (finalProvider === 'anthropic') {
        // Convert message format for Claude
        let claudeMessage
        if (Array.isArray(message)) {
          claudeMessage = message.map(item => {
            if (item.type === 'text') {
              return { type: 'text', text: item.text }
            } else if (item.type === 'image_url') {
              return {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: item.image_url.url.split(',')[1]
                }
              }
            }
            return item
          })
        } else {
          claudeMessage = [{ type: 'text', text: message }]
        }

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
            system: enhancedSystemPrompt,
            messages: [
              {
                role: 'user',
                content: claudeMessage
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
