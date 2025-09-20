// Test Google Gemini API directly
const GOOGLE_API_KEY = 'AIzaSyBvQZvQZvQZvQZvQZvQZvQZvQZvQZvQZvQ'; // Replace with actual key

async function testGoogleAPI() {
  try {
    console.log('Testing Google Gemini API...');
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GOOGLE_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: 'Hello, this is a test message. Please respond with "Google API test successful!"'
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 100
        }
      })
    });
    
    console.log('Response status:', response.status);
    const data = await response.json();
    console.log('Response data:', JSON.stringify(data, null, 2));
    
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      console.log('✅ Google API test successful!');
      console.log('Response:', data.candidates[0].content.parts[0].text);
    } else {
      console.log('❌ Google API test failed - no valid response');
    }
    
  } catch (error) {
    console.error('❌ Google API test failed:', error.message);
  }
}

testGoogleAPI();
