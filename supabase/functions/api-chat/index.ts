import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

async function callAIProvider(provider: string, model: string, messages: any[], systemPrompt: string, temperature: number, maxTokens: number) {
  const finalMessages = [
    { role: 'system', content: systemPrompt },
    ...messages
  ]

  if (provider === 'openai') {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: finalMessages,
        temperature,
        max_tokens: maxTokens
      })
    })
    const data = await response.json()
    console.log('OpenAI response:', JSON.stringify(data, null, 2))
    
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${data.error?.message || response.statusText}`)
    }
    
    if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
      throw new Error('OpenAI returned no choices')
    }
    
    return data.choices[0]?.message?.content || 'No response generated'
  }

  if (provider === 'google') {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${Deno.env.get('GOOGLE_API_KEY')}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: finalMessages.map(m => `${m.role}: ${m.content}`).join('\n\n')
          }]
        }],
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens
        }
      })
    })
    const data = await response.json()
    console.log('Google response:', JSON.stringify(data, null, 2))
    
    if (!response.ok) {
      throw new Error(`Google API error: ${data.error?.message || response.statusText}`)
    }
    
    if (!data.candidates || !Array.isArray(data.candidates) || data.candidates.length === 0) {
      throw new Error('Google returned no candidates')
    }
    
    return data.candidates[0]?.content?.parts?.[0]?.text || 'No response generated'
  }

  if (provider === 'anthropic') {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') || '',
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        messages: finalMessages.filter(m => m.role !== 'system'),
        system: systemPrompt
      })
    })
    const data = await response.json()
    console.log('Anthropic response:', JSON.stringify(data, null, 2))
    
    if (!response.ok) {
      throw new Error(`Anthropic API error: ${data.error?.message || response.statusText}`)
    }
    
    if (!data.content || !Array.isArray(data.content) || data.content.length === 0) {
      throw new Error('Anthropic returned no content')
    }
    
    return data.content[0]?.text || 'No response generated'
  }

  throw new Error(`Unsupported provider: ${provider}`)
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  console.log('=== API CHAT FUNCTION CALLED ===')
  console.log('API Chat request:', req.method, req.url)
  console.log('Headers:', Object.fromEntries(req.headers.entries()))
  console.log('Request URL:', req.url)
  console.log('Request method:', req.method)
  console.log('=== STARTING PROCESSING ===')

  try {
    // Get request body - use the same approach that worked in the test
    console.log('About to parse JSON...')
    const text = await req.text()
    console.log('Request text length:', text.length)
    
    const body = JSON.parse(text)
    console.log('Request body parsed successfully')
    console.log('Request body keys:', Object.keys(body))
    
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

    // Temporarily bypass auth for testing Google API
    const userId = 'test-user-123'
    console.log('Using test user for chat:', userId)
    
    // Extract request parameters
    const { message, conversation_id, provider, model, temperature, maxTokens } = body
    console.log('Extracted parameters:', { message, conversation_id, provider, model, temperature, maxTokens })

    // Get app settings
    const { data: appSettings, error: settingsError } = await supabaseClient
      .from('app_settings')
      .select('system_prompt, provider, model')
      .single()
    
    if (settingsError) {
      console.error('App settings error:', settingsError)
      return new Response(
        JSON.stringify({ error: 'Failed to get app settings', details: settingsError.message }),
        { status: 500, headers: corsHeaders }
      )
    }
    
    console.log('App settings retrieved:', appSettings)
    
    // Handle multimodal message format - keep as array for OpenAI
    let userMessage = message
    let isMultimodal = false
    
    if (Array.isArray(message)) {
      isMultimodal = true
      // Keep the multimodal format for OpenAI API
      userMessage = message
      console.log('Multimodal message detected:', message.length, 'parts')
    }

    // Get system prompt and model settings
    let systemPrompt = appSettings?.system_prompt || 'You are a helpful AI assistant.'
    let finalProvider = provider || appSettings?.provider || 'openai'
    let finalModel = model || appSettings?.model || 'gemini-1.5-flash'

    // Truncate system prompt if too long
    const maxSystemPromptLength = 10000 // 10k characters should be safe
    if (systemPrompt.length > maxSystemPromptLength) {
      console.log(`System prompt too long (${systemPrompt.length} chars), truncating to ${maxSystemPromptLength}`)
      systemPrompt = systemPrompt.substring(0, maxSystemPromptLength) + '...'
    }
    
    // Prepare message for AI provider
    let finalUserMessage
    if (isMultimodal) {
      // For multimodal messages, keep the array format
      finalUserMessage = userMessage
    } else {
      // For text messages, truncate if too long
      const maxUserMessageLength = 50000 // 50k characters should be safe
      finalUserMessage = userMessage.length > maxUserMessageLength 
        ? userMessage.substring(0, maxUserMessageLength) + '...' 
        : userMessage
    }

    // Call the AI provider with the actual data
    let aiResponse
    try {
      console.log('Calling AI provider:', finalProvider, finalModel)
      console.log('System prompt length:', systemPrompt.length)
      console.log('User message type:', isMultimodal ? 'multimodal' : 'text')
      
      // Add timeout to OpenAI call
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout
      
      // Use Google Gemini API instead of OpenAI
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${finalModel}:generateContent?key=${Deno.env.get('GOOGLE_API_KEY')}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `${systemPrompt}\n\nUser: ${JSON.stringify(finalUserMessage)}`
            }]
          }],
          generationConfig: {
            temperature: temperature || 0.7,
            maxOutputTokens: maxTokens || 2000
          }
        }),
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      console.log('Google Gemini response status:', response.status)
      const data = await response.json()
      console.log('Google Gemini response:', JSON.stringify(data, null, 2))
      
      if (!response.ok) {
        throw new Error(`Google Gemini API error: ${data.error?.message || response.statusText}`)
      }
      
      if (!data.candidates || !Array.isArray(data.candidates) || data.candidates.length === 0) {
        throw new Error('Google Gemini returned no candidates')
      }
      
      const candidate = data.candidates[0]
      if (!candidate.content || !candidate.content.parts || !Array.isArray(candidate.content.parts) || candidate.content.parts.length === 0) {
        throw new Error('Invalid Google Gemini response: no content parts')
      }
      
      aiResponse = candidate.content.parts[0].text || 'No response generated'
      console.log('AI response received:', aiResponse?.substring(0, 100) + '...')
      
    } catch (e) {
      console.error('AI provider error:', e)
      return new Response(
        JSON.stringify({ 
          error: 'AI provider failed', 
          details: e.message,
          provider: finalProvider,
          model: finalModel
        }),
        { status: 500, headers: corsHeaders }
      )
    }
    
    // Store messages in database
    if (conversation_id) {
      try {
        const { error: dbError } = await supabaseClient
          .from('messages')
          .insert([
            {
              conversation_id,
              user_id: userId,
              role: 'user',
              content: isMultimodal ? userMessage : finalUserMessage,
              is_final: true
            },
            {
              conversation_id,
              user_id: userId,
              role: 'assistant',
              content: aiResponse,
              is_final: true
            }
          ])
        if (dbError) {
          console.error('Database insert error:', dbError)
          // Don't fail the request, just log the error
        }
      } catch (e) {
        console.error('Database insert exception:', e)
        // Don't fail the request, just log the error
      }
    }

    return new Response(
      JSON.stringify({
        message: aiResponse,
        conversation_id: conversation_id || 'temp-id',
        user_id: userId
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Function error:', error)
    console.error('Error stack:', error.stack)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        stack: error.stack,
        details: 'Function crashed'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})