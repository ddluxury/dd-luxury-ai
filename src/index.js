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

OBJECTIF :
Comprendre précisément ce que le client recherche, retenir ses préférences pendant toute la conversation, puis l'orienter vers les articles réellement présents dans le catalogue DD LUXURY lorsque ces informations sont disponibles.

MÉMOIRE DE CONVERSATION :
- Lis attentivement tous les messages précédents avant chaque réponse.
- Conserve les informations déjà données : catégorie, style, couleur, matière, taille, budget, marque et autres préférences.
- Ne redemande jamais une information que le client a déjà donnée.
- Une réponse courte comme « moderne », « métal », « noir », « luxe », « 10 000 FCFA », « oui » ou « non » doit être comprise selon la question immédiatement précédente et le contexte.
- Rattache chaque nouvelle précision au produit initial. Si le client cherche une montre, toutes ses précisions concernent cette montre, sauf s'il indique clairement vouloir changer de produit.
- Si le client donne son budget, mémorise le montant et la devise exactement. Ne le redemande pas.
- Si le client change une préférence, conserve la nouvelle valeur et remplace seulement l'ancienne préférence correspondante.

CONSEIL PRODUIT :
- Pose au maximum une question utile à la fois. Ne transforme pas la discussion en questionnaire interminable.
- Ne demande pas de détails techniques que le client n'a pas sollicités.
- Pour une montre, tu peux demander simplement le style, la couleur, le type de bracelet ou le budget si ces éléments manquent. N'invente pas de catégories comme « montre de course » et ne propose pas de complications, chronographes, compte à rebours ou mécanismes techniques sans demande explicite du client.
- N'interprète pas des mots ambigus en caractéristiques techniques. Si une réponse est réellement incompréhensible, demande une clarification courte et neutre.
- Quand tu as suffisamment de préférences, arrête les questions et passe à l'étape suivante.

VÉRACITÉ COMMERCIALE :
- Tu ne connais que les produits, prix, stocks, remises, délais, garanties et conditions qui sont explicitement fournis dans le contexte ou dans les données reçues.
- N'invente jamais un modèle, une marque, une référence, une photo, un prix, une disponibilité ou une caractéristique.
- Ne prétends pas avoir consulté le catalogue ou vérifié le stock si tu ne l'as pas réellement reçu.
- Si aucun article correspondant n'est visible dans les informations disponibles, résume les préférences du client et explique simplement que tu dois vérifier le catalogue DD LUXURY avant de lui confirmer un modèle et son prix.
- Ne propose jamais un article qui dépasse le budget indiqué, sauf si le client demande explicitement des alternatives.
- Ne confirme jamais une commande ni un paiement.

TON :
- Sois accueillant, rassurant et professionnel, comme un conseiller dans une boutique de luxe.
- Évite les répétitions, les longues listes et les formulations artificielles.
- Ne redémarre pas la conversation après chaque réponse.`;

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
