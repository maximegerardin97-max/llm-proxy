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
        // Get all files from flows bucket using service role
        const serviceClient = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )
        
        const { data: files, error: storageError } = await serviceClient.storage
          .from('flows')
          .list('', { limit: 1000 })
        
        if (storageError) {
          console.error('Storage error:', storageError)
          return new Response(JSON.stringify({ error: 'Storage error' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        
        if (!files || files.length === 0) {
          return new Response(JSON.stringify({ error: 'No files found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        
        // Return files with proper metadata
        const filesWithInfo = files.map(file => ({
          name: file.name,
          metadata: {
            mimetype: file.metadata?.mimetype || 'application/octet-stream',
            size: file.metadata?.size || 0
          }
        }))
        
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
            JSON.stringify(conversations || []),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        } catch (error) {
          console.error('Load conversations error:', error)
          return new Response(
            JSON.stringify([]),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
      // POST /inspirations - Call your existing inspirations function with service role key
      try {
        const { recommendation } = await req.json()
        
        // Call your existing inspirations function with service role key for storage access
        const inspirationsUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/inspirations`
        const inspirationsResponse = await fetch(inspirationsUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ recommendation })
        })

        if (!inspirationsResponse.ok) {
          throw new Error(`Inspirations function error: ${inspirationsResponse.status}`)
        }

        const inspirationsData = await inspirationsResponse.json()
        
        return new Response(JSON.stringify(inspirationsData), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      } catch (error) {
        console.error('Inspirations proxy error:', error)
        return new Response(
          JSON.stringify({ error: 'Failed to load inspirations', details: error.message }),
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

    // Parse request body first
    const body = await req.json()

    // Handle ensure_profile action
    if (path.includes('/ensure_profile') || (req.method === 'POST' && body.action === 'ensure_profile')) {
      try {
        const { user_id, email } = body
        console.log('Ensuring profile for user:', user_id, email)
        
        // Check if profile exists
        const { data: existingProfile, error: checkError } = await supabaseClient
          .from('profiles')
          .select('id')
          .eq('id', user_id)
          .single()

        if (checkError && checkError.code === 'PGRST116') {
          // Profile doesn't exist, create it
          const { error: insertError } = await supabaseClient
            .from('profiles')
            .insert({
              id: user_id,
              email: email
            })

          if (insertError) {
            console.error('Error creating profile:', insertError)
            return new Response(
              JSON.stringify({ error: 'Failed to create profile', details: insertError.message }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
          
          console.log('Profile created successfully for user:', user_id)
        } else if (checkError) {
          console.error('Error checking profile:', checkError)
          return new Response(
            JSON.stringify({ error: 'Failed to check profile', details: checkError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        } else {
          console.log('Profile already exists for user:', user_id)
        }

        return new Response(
          JSON.stringify({ success: true, message: 'Profile ensured' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      } catch (error) {
        console.error('Ensure profile error:', error)
        return new Response(
          JSON.stringify({ error: 'Ensure profile failed', details: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Default: Handle chat message (POST /)
    try {
      const { message, provider, model, temperature, maxTokens, conversation_id } = body

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
      const finalProvider = settings?.provider || 'anthropic'
      const finalModel = settings?.model || 'claude-3-5-haiku-20241022'

      // Search knowledge base for relevant documents from flows bucket
      let relevantDocs = []
      try {
        const serviceClient = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )
        
        // Recursively get all files from flows bucket
        async function getAllFiles(path = '') {
          const { data: items, error } = await serviceClient.storage
            .from('flows')
            .list(path, { limit: 1000 })
          
          if (error) {
            console.error(`Error listing ${path}:`, error)
            return []
          }
          
          let allFiles = []
          
          for (const item of items || []) {
            // Check if it's a folder by looking at size and mimetype
            const isFolder = item.metadata?.size === null || item.metadata?.size === 0 || item.metadata?.mimetype === 'application/octet-stream' || !item.metadata?.mimetype
            
            if (isFolder) {
              // It's a folder, recurse into it
              const folderPath = path ? `${path}/${item.name}` : item.name
              const folderFiles = await getAllFiles(folderPath)
              allFiles = allFiles.concat(folderFiles)
            } else {
              // It's a file, add it with full path
              const fullPath = path ? `${path}/${item.name}` : item.name
              allFiles.push({
                ...item,
                name: fullPath
              })
            }
          }
          
          return allFiles
        }
        
        const allFiles = await getAllFiles()
        console.log('Total files found for knowledge search:', allFiles.length)
        
        if (allFiles.length > 0) {
          // Search through file names for relevant documents
          const searchTerm = message.toString().toLowerCase()
          
          // Prioritize handbooks and design-related files
          const handbookFiles = allFiles.filter(file => 
            file.name.toLowerCase().includes('handbook') ||
            file.name.toLowerCase().includes('guide') ||
            file.name.toLowerCase().includes('manual') ||
            file.name.toLowerCase().includes('documentation')
          )
          
          const designFiles = allFiles.filter(file => 
            file.name.toLowerCase().includes('design') ||
            file.name.toLowerCase().includes('ui') ||
            file.name.toLowerCase().includes('ux') ||
            file.name.toLowerCase().includes('flow')
          )
          
          const generalFiles = allFiles.filter(file => 
            file.name.toLowerCase().includes(searchTerm) ||
            (file.metadata && JSON.stringify(file.metadata).toLowerCase().includes(searchTerm))
          )
          
          // Combine and prioritize: handbooks first, then design files, then general matches
          relevantDocs = [
            ...handbookFiles.slice(0, 3),
            ...designFiles.slice(0, 2),
            ...generalFiles.slice(0, 5)
          ].slice(0, 8) // Limit to 8 most relevant documents
          
          console.log('Relevant documents found:', relevantDocs.length)
          console.log('Sample relevant docs:', relevantDocs.slice(0, 3).map(d => d.name))
        }
      } catch (error) {
        console.error('Knowledge base search error:', error)
      }

      // Enhance system prompt with knowledge base context
      let enhancedSystemPrompt = systemPrompt
      if (relevantDocs.length > 0) {
        const knowledgeContext = relevantDocs.map(doc => 
          `📄 ${doc.name} (${doc.metadata?.mimetype || 'unknown'}, ${Math.round((doc.metadata?.size || 0) / 1024)}KB)`
        ).join('\n')
        enhancedSystemPrompt += `\n\n📚 Available Knowledge Base Documents:\n${knowledgeContext}\n\nUse these documents to provide accurate, comprehensive answers. Reference specific documents when relevant.`
      }

      // Get conversation history for context
      let conversationHistory = []
      if (conversation_id) {
        try {
          console.log('Retrieving conversation history for:', conversation_id)
          const { data: messages, error: historyError } = await supabaseClient
            .from('messages')
            .select('role, content, created_at')
            .eq('conversation_id', conversation_id)
            .eq('is_final', true)
            .order('created_at', { ascending: true })
            .limit(20) // Get last 20 messages (10 exchanges)
          
          if (historyError) {
            console.error('Error retrieving conversation history:', historyError)
          } else {
            conversationHistory = messages || []
            console.log('Retrieved conversation history:', conversationHistory.length, 'messages')
          }
        } catch (e) {
          console.error('Exception retrieving conversation history:', e)
        }
      }

      // Call the appropriate AI provider
      let aiResponse
      try {
        console.log('Calling AI provider:', finalProvider, finalModel)
        console.log('Conversation history length:', conversationHistory.length)
        
        if (finalProvider === 'openai') {
          // Build messages array with conversation history
          const messages = [{ role: 'system', content: enhancedSystemPrompt }]
          
          // Add conversation history
          conversationHistory.forEach(msg => {
            if (msg.role === 'user') {
              const content = msg.content?.value || msg.content
              messages.push({ 
                role: 'user', 
                content: Array.isArray(content) ? content : [{ type: 'text', text: content }] 
              })
            } else if (msg.role === 'assistant') {
              messages.push({ 
                role: 'assistant', 
                content: msg.content?.value || msg.content 
              })
            }
          })
          
          // Add current message
          messages.push({ 
            role: 'user', 
            content: Array.isArray(message) ? message : [{ type: 'text', text: message }] 
          })

          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: finalModel,
              messages: messages,
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
          // Build messages array with conversation history for Claude
          const claudeMessages = []
          
          // Add conversation history
          conversationHistory.forEach(msg => {
            if (msg.role === 'user') {
              const content = msg.content?.value || msg.content
              let claudeMessage
              if (Array.isArray(content)) {
                claudeMessage = content.map(item => {
                  if (item.type === 'text') {
                    return { type: 'text', text: item.text }
                  } else if (item.type === 'image_url') {
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
                claudeMessage = [{ type: 'text', text: content }]
              }
              claudeMessages.push({
                role: 'user',
                content: claudeMessage
              })
            } else if (msg.role === 'assistant') {
              claudeMessages.push({
                role: 'assistant',
                content: msg.content?.value || msg.content
              })
            }
          })
          
          // Add current message
          let claudeMessage
          if (Array.isArray(message)) {
            claudeMessage = message.map(item => {
              if (item.type === 'text') {
                return { type: 'text', text: item.text }
              } else if (item.type === 'image_url') {
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
          claudeMessages.push({
            role: 'user',
            content: claudeMessage
          })

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
              messages: claudeMessages
            })
          })

          if (!response.ok) {
            const errorData = await response.text()
            throw new Error(`Anthropic API error: ${response.status} ${errorData}`)
          }

          const data = await response.json()
          aiResponse = data.content[0].text

        } else if (finalProvider === 'google') {
          // Build conversation context for Google Gemini
          let conversationContext = enhancedSystemPrompt + '\n\n'
          
          // Add conversation history
          if (conversationHistory.length > 0) {
            conversationContext += 'Previous conversation:\n'
            conversationHistory.forEach(msg => {
              if (msg.role === 'user') {
                const content = msg.content?.value || msg.content
                if (Array.isArray(content)) {
                  conversationContext += `User: ${content.map(item => 
                    item.type === 'text' ? item.text : `[Image: ${item.type}]`
                  ).join(' ')}\n\n`
                } else {
                  conversationContext += `User: ${content}\n\n`
                }
              } else if (msg.role === 'assistant') {
                conversationContext += `Assistant: ${msg.content?.value || msg.content}\n\n`
              }
            })
          }
          
          // Add current message
          if (Array.isArray(message)) {
            conversationContext += `Current user message: ${message.map(item => 
              item.type === 'text' ? item.text : `[Image: ${item.type}]`
            ).join(' ')}`
          } else {
            conversationContext += `Current user message: ${message}`
          }

          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${finalModel}:generateContent?key=${Deno.env.get('GOOGLE_API_KEY')}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              contents: [{
                parts: [{ text: conversationContext }]
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