export const config = {
  runtime: 'edge',
};

export default function handler(request) {
  return new Response(
    JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      env: {
        hasSupabaseUrl: !!process.env.VITE_SUPABASE_URL,
        hasSupabaseKey: !!process.env.VITE_SUPABASE_ANON_KEY,
        hasExternalUsername: !!process.env.VITE_EXTERNAL_SITE_USERNAME,
        hasExternalPassword: !!process.env.VITE_EXTERNAL_SITE_PASSWORD,
      },
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
}
