export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const allowedOrigin = "https://ddluxury.netlify.app";
    const corsHeaders = {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    };

    // Autoriser les requêtes de vérification du navigateur pour le chatbot
    if (request.method === "OPTIONS" && url.pathname === "/chat") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Page d'accueil : vérifier que le serveur fonctionne
    if (request.method === "GET" && url.pathname === "/") {
      return new Response("DD LUXURY AI est en ligne !");
    }

    // Chatbot du site DD LUXURY
    if (request.method === "POST" && url.pathname === "/chat") {
      try {
        const body = await request.json();
        const message = typeof body.message === "string" ? body.message.trim() : "";

        if (!message) {
          return new Response(
            JSON.stringify({ error: "Veuillez écrire un message." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } }
          );
        }

        if (message.length > 2000) {
          return new Response(
            JSON.stringify({ error: "Votre message est trop long. Limitez-le à 2 000 caractères." }),
            { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } }
          );
        }

        const systemPrompt = `Tu es l'assistant virtuel officiel de DD LUXURY, une boutique en ligne d'articles de mode et d'accessoires de luxe.
Réponds toujours en français, avec politesse, élégance, simplicité et brièveté.
Accueille chaleureusement les visiteurs et aide-les à préciser leurs goûts, leurs besoins et leur budget.
Ne prétends jamais avoir accès au catalogue, aux stocks, aux prix, aux commandes ou aux paiements si ces informations ne sont pas fournies dans la conversation.
N'invente jamais de produit, de prix, de disponibilité, de remise, de délai de livraison, de garantie ou de moyen de paiement.
Si une information commerciale précise manque, explique-le clairement et propose de vérifier auprès de DD LUXURY.
Ne confirme jamais une commande ni un paiement.
Pose une seule question à la fois lorsque tu as besoin d'une précision.`;

        const result = await env.AI.run("@cf/zai-org/glm-4.7-flash", {
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message }
          ],
          max_completion_tokens: 400,
          temperature: 0.6
        });

        const reply = result?.choices?.[0]?.message?.content
          ?? result?.response
          ?? "Je suis désolé, je n'ai pas réussi à formuler une réponse. Peux-tu réessayer ?";

        return new Response(
          JSON.stringify({ reply }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } }
        );
      } catch (error) {
        console.error("Erreur du chatbot DD LUXURY :", error?.message ?? String(error));
        return new Response(
          JSON.stringify({ error: "Le chatbot rencontre momentanément un problème. Merci de réessayer." }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } }
        );
      }
    }

    // Vérification du webhook par Meta
    if (request.method === "GET" && url.pathname === "/webhook") {
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");

      if (mode === "subscribe" && token === env.VERIFY_TOKEN) {
        return new Response(challenge, { status: 200 });
      }

      return new Response("Vérification refusée", { status: 403 });
    }

    // Réception des messages WhatsApp
    if (request.method === "POST" && url.pathname === "/webhook") {
      const body = await request.json();

      console.log("Message WhatsApp reçu :", body);

      return new Response("EVENT_RECEIVED", { status: 200 });
    }

    return new Response("Page introuvable", { status: 404 });
  }
};
