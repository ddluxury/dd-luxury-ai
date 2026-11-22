export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const allowedOrigins = [
      "https://ddluxury.netlify.app",
      "http://127.0.0.1:5500",
      "http://localhost:5500"
    ];
    const origin = request.headers.get("Origin");
    const corsHeaders = {
      ...(origin && allowedOrigins.includes(origin)
        ? { "Access-Control-Allow-Origin": origin }
        : {}),
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

RÈGLES DE CONVERSATION :
- Tu dois lire et utiliser tout l'historique des messages fourni.
- Garde toujours le contexte des demandes précédentes et ne fais pas recommencer le client.
- Si le client précise "moderne", "classique", une couleur, un budget ou une préférence, rattache cette précision au produit qu'il a demandé juste avant.
- Exemple : si le client dit "je cherche une montre", puis "moderne", comprends qu'il cherche une montre moderne. Ne change pas de catégorie et ne lui demande pas s'il cherche un sac, des chaussures ou des vêtements.
- Une montre est bien une catégorie de produit. Tu peux aider le client à préciser le style de montre recherché.
- Si le client répond brièvement ("oui", "non", "moderne", "noir", etc.), interprète sa réponse à partir de la question et du contexte précédents.
- Pose une seule question à la fois et reste centré sur le besoin exprimé.

ACCUEIL ET CONSEIL :
- Accueille chaleureusement les visiteurs et aide-les à préciser leurs goûts, leurs besoins et leur budget.
- Ne prétends jamais avoir accès au catalogue, aux stocks, aux prix, aux commandes ou aux paiements si ces informations ne sont pas fournies dans la conversation.
- N'invente jamais de produit, de prix, de disponibilité, de remise, de délai de livraison, de garantie ou de moyen de paiement.
- Si une information commerciale précise manque, explique-le clairement et propose de vérifier auprès de DD LUXURY.
- Ne confirme jamais une commande ni un paiement.`;

        // Récupérer et valider l'historique transmis par le navigateur.
        const history = Array.isArray(body.messages)
          ? body.messages
              .filter((item) =>
                item &&
                (item.role === "user" || item.role === "assistant") &&
                typeof item.content === "string" &&
                item.content.trim()
              )
              .slice(-12)
              .map((item) => ({
                role: item.role,
                content: item.content.trim().slice(0, 2000)
              }))
          : [];

        // Compatibilité avec les anciennes versions du chatbot qui n'envoient
        // que le champ "message".
        const lastHistoryMessage = history[history.length - 1];
        if (
          !lastHistoryMessage ||
          lastHistoryMessage.role !== "user" ||
          lastHistoryMessage.content !== message
        ) {
          history.push({ role: "user", content: message });
        }

        const result = await env.AI.run("@cf/zai-org/glm-4.7-flash", {
          messages: [
            { role: "system", content: systemPrompt },
            ...history
          ],
          max_completion_tokens: 600,
          temperature: 0.6,
          chat_template_kwargs: {
            enable_thinking: false,
            clear_thinking: true
          }
        });

        const rawContent = result?.choices?.[0]?.message?.content;
        const reply = typeof rawContent === "string"
          ? rawContent
          : Array.isArray(rawContent)
            ? rawContent.map((part) => typeof part === "string" ? part : part?.text ?? "").join("")
            : result?.response
              ?? result?.output_text
              ?? result?.result?.response
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
