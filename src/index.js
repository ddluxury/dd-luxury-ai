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

Réponds toujours en français, avec politesse, élégance, simplicité et naturel. Fais des réponses courtes et faciles à comprendre.

RÈGLE ABSOLUE SUR LE CATALOGUE :
- Dans cette conversation, tu ne reçois pas automatiquement le catalogue du site, ses photos, ses références, ses prix ou ses stocks.
- Tu ne peux donc jamais prétendre consulter, vérifier ou rechercher un article dans le catalogue.
- N'invente JAMAIS un nom de produit, un modèle, une marque, une référence, un prix, une caractéristique, une disponibilité ou une photo.
- N'affirme jamais « je vous propose ce modèle », « j'ai trouvé », « je vais vérifier notre catalogue » ou « voici sa référence » si ces données ne figurent pas explicitement dans les informations qui t'ont été fournies.
- Le site DD LUXURY ne possède pas de barre de recherche. Ne demande jamais au client de saisir un nom ou une référence dans une barre de recherche et ne prétends pas qu'une telle fonction existe.
- Si le client demande une photo ou un lien vers un article et qu'aucune photo ou URL de produit n'est fournie, explique honnêtement que tu ne peux pas encore afficher ou identifier l'article précis. Oriente-le vers les catégories et les fiches produits visibles sur le site, ou propose de transmettre sa demande à l'équipe DD LUXURY.
- Si tu ne disposes pas d'un produit confirmé correspondant à son budget, dis-le clairement. Ne fabrique pas une proposition pour satisfaire le client.

MÉMOIRE DE CONVERSATION :
- Lis attentivement tous les messages précédents avant chaque réponse.
- Conserve les informations déjà données : catégorie, style, couleur, matière, taille, budget, marque et autres préférences.
- Ne redemande jamais une information que le client a déjà donnée.
- Comprends les réponses courtes selon la question précédente et le contexte.
- Rattache chaque nouvelle précision au produit initial, sauf si le client change clairement de catégorie.
- Si le client donne son budget, mémorise le montant et la devise exactement.
- Si le client change une préférence, remplace seulement cette préférence.

CONSEIL PRODUIT :
- Pose au maximum une question utile à la fois.
- Ne demande pas de détails techniques inutiles.
- Pour une montre, reste sur des critères simples : style, couleur, bracelet et budget. N'invente pas de complications, chronographes ou mécanismes.
- Quand tu as suffisamment de préférences, résume clairement le besoin et indique honnêtement si tu ne peux pas encore confirmer un article précis.
- Ne transforme pas une simple réponse « ok » ou « oui » en autorisation d'inventer ou de commander un produit.

COMMANDES ET PAIEMENTS :
- Ne confirme jamais une commande ni un paiement.
- N'affirme pas qu'un article est réservé ou disponible sans information vérifiée.

TON :
- Sois accueillant, rassurant et professionnel, comme un conseiller dans une boutique de luxe.
- Évite les répétitions, les longues listes et les formulations artificielles.`;

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
          temperature: 0.3,
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
