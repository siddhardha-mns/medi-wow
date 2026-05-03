import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { conversations, messages } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { ensureCompatibleFormat, voiceChatStream } from "@workspace/integrations-openai-ai-server/audio";
import {
  CreateOpenaiConversationBody,
  GetOpenaiConversationParams,
  DeleteOpenaiConversationParams,
  ListOpenaiMessagesParams,
  SendOpenaiMessageParams,
  SendOpenaiMessageBody,
  SendOpenaiVoiceMessageParams,
  SendOpenaiVoiceMessageBody,
} from "@workspace/api-zod";
import { eq, asc } from "drizzle-orm";
import { activityLogTable } from "@workspace/db";

const router: IRouter = Router();

const SYSTEM_PROMPT = `You are MediNova Assistant — a knowledgeable, empathetic medical companion.
You provide general health information, medication guidance, and wellness tips.
IMPORTANT: You are NOT a replacement for professional medical advice. Always recommend consulting a doctor for serious conditions.

LANGUAGE RULES (follow strictly):
- Detect the language of every user message and respond ONLY in that language.
- If the user writes in Telugu (Unicode range U+0C00–U+0C7F, e.g. నమస్కారం, మందులు, ఆరోగ్యం), you MUST reply entirely in Telugu script.
- If the user writes in Hindi (Devanagari, e.g. नमस्ते, दवाई), reply entirely in Hindi.
- If the user writes in Tamil (e.g. வணக்கம்), reply entirely in Tamil.
- If the user writes in Malayalam (e.g. നമസ്കാരം), reply entirely in Malayalam.
- If the user writes in English, reply in English.
- Never switch languages mid-response. Never add English translations unless explicitly asked.

Keep responses concise, warm, and helpful. Use simple language appropriate for the detected language.`;


router.get("/openai/conversations", async (req, res) => {
  try {
    const convs = await db.select().from(conversations).orderBy(conversations.createdAt);
    res.json(convs);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

router.post("/openai/conversations", async (req, res) => {
  try {
    const body = CreateOpenaiConversationBody.parse(req.body);
    const [conv] = await db.insert(conversations).values({ title: body.title }).returning();
    res.status(201).json(conv);
  } catch (err) {
    req.log.error(err);
    res.status(400).json({ error: "Invalid data" });
  }
});

router.get("/openai/conversations/:id", async (req, res) => {
  try {
    const { id } = GetOpenaiConversationParams.parse({ id: Number(req.params.id) });
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
    if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }
    const msgs = await db.select().from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(asc(messages.createdAt));
    res.json({ ...conv, messages: msgs });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch conversation" });
  }
});

router.delete("/openai/conversations/:id", async (req, res) => {
  try {
    const { id } = DeleteOpenaiConversationParams.parse({ id: Number(req.params.id) });
    await db.delete(conversations).where(eq(conversations.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete conversation" });
  }
});

router.get("/openai/conversations/:id/messages", async (req, res) => {
  try {
    const { id } = ListOpenaiMessagesParams.parse({ id: Number(req.params.id) });
    const msgs = await db.select().from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(asc(messages.createdAt));
    res.json(msgs);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

router.post("/openai/conversations/:id/messages", async (req, res) => {
  try {
    const { id } = SendOpenaiMessageParams.parse({ id: Number(req.params.id) });
    const body = SendOpenaiMessageBody.parse(req.body);

    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
    if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }

    // Save user message
    await db.insert(messages).values({
      conversationId: id,
      role: "user",
      content: body.content,
    });

    // Get conversation history
    const history = await db.select().from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(asc(messages.createdAt));

    const chatMessages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    ];

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let fullResponse = "";

    const stream = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 8192,
      messages: chatMessages,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullResponse += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    // Save assistant message
    await db.insert(messages).values({
      conversationId: id,
      role: "assistant",
      content: fullResponse,
    });

    await db.insert(activityLogTable).values({
      type: "chat_message",
      description: `AI chat: ${body.content.slice(0, 50)}${body.content.length > 50 ? "..." : ""}`,
    });

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    req.log.error(err);
    res.write(`data: ${JSON.stringify({ error: "Failed to process message" })}\n\n`);
    res.end();
  }
});

router.post("/openai/conversations/:id/voice-messages", async (req, res) => {
  try {
    const { id } = SendOpenaiVoiceMessageParams.parse({ id: Number(req.params.id) });
    const body = SendOpenaiVoiceMessageBody.parse(req.body);

    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
    if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }

    const audioBuffer = Buffer.from(body.audio, "base64");
    const { buffer, format } = await ensureCompatibleFormat(audioBuffer);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const stream = await voiceChatStream(buffer, "alloy", format);

    let assistantTranscript = "";
    let userTranscript = "";

    for await (const event of stream) {
      if (event.type === "transcript") {
        assistantTranscript += event.data;
      }
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    // Save both sides
    if (userTranscript) {
      await db.insert(messages).values({
        conversationId: id,
        role: "user",
        content: userTranscript,
      });
    }
    if (assistantTranscript) {
      await db.insert(messages).values({
        conversationId: id,
        role: "assistant",
        content: assistantTranscript,
      });
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    req.log.error(err);
    res.write(`data: ${JSON.stringify({ error: "Failed to process voice message" })}\n\n`);
    res.end();
  }
});

export default router;
