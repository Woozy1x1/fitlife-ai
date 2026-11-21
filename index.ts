
Deno.serve(async (req) => {
  return new Response(
    JSON.stringify({
      app: "FitLife AI",
      service: "oura-connect",
      status: "bereit"
    }),
    {
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
});
  
