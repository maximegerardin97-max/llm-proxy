import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client with user's JWT
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Get the user from the JWT token
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', details: authError?.message }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const url = new URL(req.url)
    const path = url.pathname

    // Handle different endpoints
    if (path.includes('/settings')) {
      // GET /settings - Return app settings
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

      return new Response(
        JSON.stringify({
          system_prompt: settings?.system_prompt || 'You are a helpful AI assistant.',
          provider: settings?.provider || 'anthropic',
          model: settings?.model || 'claude-3-5-haiku-20241022'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (path.includes('/knowledge')) {
      // GET /knowledge - Return knowledge base files
      try {
        // Recursively get all files from all subdirectories
        async function getAllFiles(path = '') {
          const { data: items, error } = await supabaseClient.storage
            .from('flows')
            .list(path, { limit: 1000 })
          
          if (error) {
            console.error('Storage error:', error)
            return []
          }
          
          const files = []
          for (const item of items || []) {
            if (item.metadata?.mimetype) {
              // It's a file
              files.push({
                ...item,
                fullPath: path ? `${path}/${item.name}` : item.name
              })
            } else {
              // It's a folder, recurse into it
              const subFiles = await getAllFiles(path ? `${path}/${item.name}` : item.name)
              files.push(...subFiles)
            }
          }
          return files
        }
        
        const allFiles = await getAllFiles()
        
        if (allFiles.length === 0) {
          return new Response(JSON.stringify({ error: 'No files found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        
        // Get file info for each file to get actual sizes
        const filesWithInfo = await Promise.all(
          allFiles.map(async (file) => {
            try {
              const { data: fileInfo } = await supabaseClient.storage
                .from('flows')
                .getPublicUrl(file.fullPath)
              
              // Try to get file metadata
              const response = await fetch(fileInfo.publicUrl, { method: 'HEAD' })
              const contentLength = response.headers.get('content-length')
              
              return {
                ...file,
                name: file.fullPath, // Use full path as name
                metadata: {
                  ...file.metadata,
                  size: contentLength ? parseInt(contentLength) : 0,
                  mimetype: file.metadata?.mimetype || 'application/octet-stream'
                }
              }
            } catch (error) {
              console.error(`Error getting info for ${file.fullPath}:`, error)
              return {
                ...file,
                name: file.fullPath,
                metadata: {
                  ...file.metadata,
                  size: 0,
                  mimetype: 'application/octet-stream'
                }
              }
            }
          })
        )
        
        return new Response(JSON.stringify(filesWithInfo), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      } catch (error) {
        console.error('Knowledge base error:', error)
        return new Response(JSON.stringify({ error: 'Failed to load knowledge base' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    if (path.includes('/stats')) {
      // GET /stats - Return user statistics
      try {
        const { data: conversations } = await supabaseClient
          .from('conversations')
          .select('id')
          .eq('user_id', user.id)

        const { data: messages } = await supabaseClient
          .from('messages')
          .select('id')
          .eq('user_id', user.id)

        return new Response(
          JSON.stringify({
            conversations: conversations?.length || 0,
            messages: messages?.length || 0
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      } catch (error) {
        console.error('Stats error:', error)
        return new Response(
          JSON.stringify({ error: 'Failed to load stats' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    if (path.includes('/conversations')) {
      if (req.method === 'GET') {
        // GET /conversations - List user conversations
        try {
          const { data: conversations, error } = await supabaseClient
            .from('conversations')
            .select('id, title, created_at, updated_at')
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false })

          if (error) throw error

          return new Response(
            JSON.stringify({ conversations: conversations || [] }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        } catch (error) {
          console.error('Load conversations error:', error)
          return new Response(
            JSON.stringify({ error: 'Failed to load conversations' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      } else if (req.method === 'POST') {
        // POST /conversations - Create new conversation
        try {
          const { data: conversation, error } = await supabaseClient
            .from('conversations')
            .insert({
              user_id: user.id,
              title: 'New conversation',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .select()
            .single()

          if (error) throw error

          return new Response(
            JSON.stringify({ conversation }),
            { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        } catch (error) {
          console.error('Create conversation error:', error)
          return new Response(
            JSON.stringify({ error: 'Failed to create conversation' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      } else if (req.method === 'PUT' && path.includes('/conversations/')) {
        // PUT /conversations/{id} - Update conversation title
        try {
          const conversationId = path.split('/conversations/')[1]
          const { title } = await req.json()

          const { error } = await supabaseClient
            .from('conversations')
            .update({ title, updated_at: new Date().toISOString() })
            .eq('id', conversationId)
            .eq('user_id', user.id)

          if (error) throw error

          return new Response(
            JSON.stringify({ success: true }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        } catch (error) {
          console.error('Update conversation error:', error)
          return new Response(
            JSON.stringify({ error: 'Failed to update conversation' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }
    }

    if (path.includes('/messages')) {
      // GET /messages?conversation_id={id} - Get messages for conversation
      try {
        const conversationId = url.searchParams.get('conversation_id')
        if (!conversationId) {
          return new Response(
            JSON.stringify({ error: 'conversation_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const { data: messages, error } = await supabaseClient
          .from('messages')
          .select('id, role, content, created_at, is_final')
          .eq('conversation_id', conversationId)
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })

        if (error) throw error

        return new Response(
          JSON.stringify({ messages: messages || [] }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      } catch (error) {
        console.error('Load messages error:', error)
        return new Response(
          JSON.stringify({ error: 'Failed to load messages' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    if (path.includes('/inspirations')) {
      // POST /inspirations - Handle inspirations request
      try {
        const { recommendation } = await req.json()
        const { app, flow, screens } = recommendation || {}

        // For now, return empty inspirations
        // This would normally query your inspirations database
        return new Response(
          JSON.stringify({
            ok: true,
            data: [],
            sources: [],
            isPerplexityFallback: false
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      } catch (error) {
        console.error('Inspirations error:', error)
        return new Response(
          JSON.stringify({ error: 'Failed to load inspirations' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    if (path.includes('/test')) {
      // GET /test - Test endpoint
      return new Response(
        JSON.stringify({ success: true, message: 'llm-proxy-auth is working' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Default: Handle chat message (POST /)
    try {
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
      const finalModel = model || settings?.model || 'claude-3-5-haiku-20241022'

      // Search knowledge base for relevant documents from flows bucket
      let relevantDocs = []
      try {
        const { data: files, error: storageError } = await supabaseClient.storage
          .from('flows')
          .list('', { limit: 1000 })
        
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
                // Extract the actual media type from the data URL
                const dataUrl = item.image_url.url
                const mediaTypeMatch = dataUrl.match(/data:([^;]+);/)
                const mediaType = mediaTypeMatch ? mediaTypeMatch[1] : 'image/jpeg'
                
                return {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: mediaType,
                    data: dataUrl.split(',')[1]
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

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})