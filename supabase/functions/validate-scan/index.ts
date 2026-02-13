import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { token, device_id } = await req.json();

    if (!token || !device_id) {
      return new Response(
        JSON.stringify({ error: "Missing token or device_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Get authenticated user
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Validate QR token (must exist and not be expired)
    const now = new Date().toISOString();
    const { data: qrToken, error: qrError } = await serviceClient
      .from("qr_tokens")
      .select("*")
      .eq("token", token)
      .gt("expires_at", now)
      .maybeSingle();

    if (qrError || !qrToken) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired QR code. Please scan a fresh code." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Device binding check
    const { data: binding } = await serviceClient
      .from("device_bindings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (binding) {
      // Device already bound — verify it matches
      if (binding.device_id !== device_id) {
        return new Response(
          JSON.stringify({ error: "Unauthorized device. Your account is bound to a different device." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // First scan — bind device
      const { error: bindError } = await serviceClient
        .from("device_bindings")
        .insert({ user_id: user.id, device_id });

      if (bindError) {
        return new Response(
          JSON.stringify({ error: "Failed to bind device: " + bindError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 3. Smart toggle: check last attendance action
    const { data: lastLog } = await serviceClient
      .from("attendance_logs")
      .select("action")
      .eq("user_id", user.id)
      .order("scanned_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextAction = !lastLog || lastLog.action === "leaving" ? "arrival" : "leaving";

    // 4. Log attendance
    const { error: logError } = await serviceClient
      .from("attendance_logs")
      .insert({ user_id: user.id, action: nextAction });

    if (logError) {
      return new Response(
        JSON.stringify({ error: "Failed to log attendance: " + logError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Delete used token to prevent reuse
    await serviceClient.from("qr_tokens").delete().eq("token", token);

    // Get user's name for the response
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .maybeSingle();

    return new Response(
      JSON.stringify({
        success: true,
        action: nextAction,
        message: `${nextAction === "arrival" ? "Welcome" : "Goodbye"}, ${profile?.full_name || "Worker"}! ${nextAction === "arrival" ? "Arrival" : "Departure"} recorded.`,
        scanned_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
