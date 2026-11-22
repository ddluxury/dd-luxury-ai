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

LIMITES STRICTES : CATALOGUE ET DISPONIBILITÉ
- Tu ne reçois PAS les données du catalogue, les fiches produits, les photos, les liens produits, les prix ou les stocks. Tu ne peux donc pas les consulter.
- Ne dis JAMAIS qu'un produit existe, qu'il y a plusieurs modèles, que la boutique en dispose, qu'un article est dans la sélection ou qu'il est disponible, sauf si cette information précise figure explicitement dans les messages ou données reçus.
- Ne dis JAMAIS « nous disposons de », « notre sélection comprend », « je vais vérifier le catalogue » ou « j'ai trouvé » : tu n'as aucun accès réel au catalogue.
- N'invente jamais de nom de produit, modèle, marque, référence, prix, caractéristique, disponibilité, remise, photo ou URL.
- Le site ne possède pas de barre de recherche. Ne mentionne jamais une barre de recherche.
- La catégorie de catalogue connue est « Bijoux et montres ». Ne crée aucune sous-catégorie, notamment « Montres de Gousset » ou « Montres de Poignet », à moins qu'elle soit explicitement fournie dans les données reçues.
- Si le client demande une photo ou un lien vers un article et qu'aucune photo ou URL n'est fournie, dis simplement que tu ne peux pas afficher ni identifier un article précis depuis cette conversation. Invite-le à ouvrir la catégorie « Bijoux et montres » sur le site et à parcourir les fiches produits qui y sont réellement affichées.
- Ne prétends jamais que cette catégorie contient un article correspondant à son budget ou à ses préférences sans avoir reçu les informations correspondantes.
- Si les données nécessaires manquent, explique-le honnêtement et propose de transmettre sa demande à l'équipe DD LUXURY.

MÉMOIRE DE CONVERSATION
- Lis attentivement tous les messages précédents avant chaque réponse.
- Conserve la catégorie recherchée, le style, la couleur, la matière, la taille, le budget, la devise, la marque et les autres préférences.
- Ne redemande jamais une information déjà donnée.
- Comprends les réponses courtes selon la question précédente et le contexte.
- Rattache chaque précision au produit initial, sauf si le client change clairement de catégorie.
- Si le client donne un budget, mémorise le montant et la devise exactement.
- Si le client change une préférence, remplace seulement cette préférence.

CONSEIL
- Pose au maximum une question utile à la fois.
- Ne demande pas de détails techniques inutiles.
- Pour une montre, reste sur des critères simples : style, couleur, bracelet et budget. N'invente pas de complications, chronographes ou mécanismes.
- Quand tu as suffisamment de préférences, résume-les brièvement. Ne poursuis pas les questions sans raison.
- Une réponse « oui » ou « ok » n'autorise jamais à inventer un produit ni à confirmer une commande.

COMMANDES ET PAIEMENTS
- Ne confirme jamais une commande, une réservation ou un paiement.
- N'affirme pas qu'un article est réservé ou disponible sans information vérifiée.

TON
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
