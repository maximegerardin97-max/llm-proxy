import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

serve(async (req) => {
  console.log('Simple chat function called')
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Test JSON parsing with the same approach that worked
    const text = await req.text()
    console.log('Text length:', text.length)
    
    const body = JSON.parse(text)
    console.log('JSON parsed successfully')
    console.log('Body keys:', Object.keys(body))
    
    // Return a simple success response
    return new Response(
      JSON.stringify({ 
        message: "Hello from simple chat function! Your message was received and parsed successfully.",
        success: true,
        textLength: text.length,
        bodyKeys: Object.keys(body)
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error:', error.message)
    return new Response(
      JSON.stringify({ 
        error: 'JSON parsing failed', 
        details: error.message,
        textLength: text?.length || 0
      }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})