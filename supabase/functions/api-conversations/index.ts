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

  console.log('Conversations request:', req.method, req.url)
  console.log('Authorization header:', req.headers.get('Authorization'))

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
      console.log('Auth error:', authError)
      return new Response(
        JSON.stringify({ error: 'Unauthorized', details: authError?.message }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const userId = user.id
    console.log('Using user for conversations:', userId)

    if (req.method === 'GET') {
      // List conversations for the user
      const { data: conversations, error } = await supabaseClient
        .from('conversations')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })

      if (error) throw error

      return new Response(
        JSON.stringify({ conversations }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (req.method === 'POST') {
      // Create new conversation
      const { title } = await req.json()
      
      const { data: conversation, error } = await supabaseClient
        .from('conversations')
        .insert({
          user_id: userId,
          title: title || 'New conversation'
        })
        .select()
        .single()

      if (error) throw error

      return new Response(
        JSON.stringify({ conversation }),
        { 
          status: 201, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (req.method === 'PUT') {
      // Update conversation
      const url = new URL(req.url)
      const conversationId = url.pathname.split('/').pop()
      const { title, page_name } = await req.json()

      const { data: conversation, error } = await supabaseClient
        .from('conversations')
        .update({ 
          title,
          page_name,
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId)
        .eq('user_id', userId)
        .select()
        .single()

      if (error) throw error

      return new Response(
        JSON.stringify({ conversation }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { 
        status: 405, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
