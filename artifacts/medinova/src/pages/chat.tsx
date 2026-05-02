import React, { useState, useRef, useEffect, useCallback } from "react";
import { useSearch } from "wouter";
import {
  useListOpenaiConversations,
  useCreateOpenaiConversation,
  useGetOpenaiConversation,
  useDeleteOpenaiConversation,
  getListOpenaiConversationsQueryKey,
  getGetOpenaiConversationQueryKey,
} from "@workspace/api-client-react";
import {
  useVoiceRecorder,
  useVoiceStream,
} from "@workspace/integrations-openai-ai-react/audio";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Mic, MicOff, Send, Trash2, MessageSquare,
  Globe, Bot, User, Volume2
} from "lucide-react";

const LANG_LABELS: Record<string, string> = {
  en: "English", hi: "Hindi", te: "Telugu", ta: "Tamil", ml: "Malayalam",
  es: "Spanish", fr: "French", de: "German", zh: "Chinese", ar: "Arabic",
};

const WORKLET_PATH = "/audio-playback-worklet.js";

function detectLanguage(text: string): string | null {
  if (/[\u0900-\u097F]/.test(text)) return "hi";
  if (/[\u0C00-\u0C7F]/.test(text)) return "te";
  if (/[\u0B80-\u0BFF]/.test(text)) return "ta";
  if (/[\u0D00-\u0D7F]/.test(text)) return "ml";
  return null;
}

type Message = {
  id?: number;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
  streaming?: boolean;
  isVoice?: boolean;
};

export default function Chat() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const initialVoiceConvId = params.get("voice") ? Number(params.get("voice")) : null;

  const { data: conversations, isLoading: isLoadingConvs } = useListOpenaiConversations();
  const createConv = useCreateOpenaiConversation();
  const deleteConv = useDeleteOpenaiConversation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedId, setSelectedId] = useState<number | null>(initialVoiceConvId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [detectedLang, setDetectedLang] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [userTranscriptBuffer, setUserTranscriptBuffer] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { state: recState, startRecording, stopRecording } = useVoiceRecorder();

  const { streamVoiceResponse, playbackState } = useVoiceStream({
    workletPath: WORKLET_PATH,
    onUserTranscript: (text) => {
      setUserTranscriptBuffer((prev) => prev + text);
    },
    onTranscript: (_chunk, full) => {
      setIsSpeaking(true);
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.streaming && last.role === "assistant") {
          updated[updated.length - 1] = { ...last, content: full };
        }
        return updated;
      });
    },
    onComplete: (transcript) => {
      setIsSpeaking(false);
      setIsStreaming(false);
      setMessages((prev) => {
        const updated = [...prev];
        // Finalize user message
        const userIdx = updated.findIndex((m) => m.streaming && m.role === "user");
        if (userIdx !== -1) updated[userIdx] = { ...updated[userIdx], streaming: false };
        // Finalize assistant message
        const last = updated[updated.length - 1];
        if (last?.streaming && last.role === "assistant") {
          updated[updated.length - 1] = { ...last, content: transcript, streaming: false };
        }
        return updated;
      });
      setUserTranscriptBuffer("");
      if (selectedId) {
        queryClient.invalidateQueries({ queryKey: getGetOpenaiConversationQueryKey(selectedId) });
        queryClient.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
      }
    },
    onError: (err) => {
      setIsSpeaking(false);
      setIsStreaming(false);
      toast({ title: "Voice error", description: err.message, variant: "destructive" });
    },
  });

  const { data: convData, isLoading: isLoadingMsgs } = useGetOpenaiConversation(
    selectedId ?? 0,
    { query: { enabled: !!selectedId, queryKey: getGetOpenaiConversationQueryKey(selectedId ?? 0) } }
  );

  useEffect(() => {
    if (convData?.messages && !isStreaming) {
      setMessages(
        convData.messages.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          createdAt: m.createdAt,
        }))
      );
    }
  }, [convData, isStreaming]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSpeaking]);

  // Update the user voice message in real-time as transcript arrives
  useEffect(() => {
    if (userTranscriptBuffer) {
      setMessages((prev) => {
        const updated = [...prev];
        const userIdx = updated.findIndex((m) => m.streaming && m.role === "user" && m.isVoice);
        if (userIdx !== -1) {
          updated[userIdx] = { ...updated[userIdx], content: userTranscriptBuffer };
        }
        return updated;
      });
    }
  }, [userTranscriptBuffer]);

  const handleNewConversation = async () => {
    try {
      const conv = await createConv.mutateAsync({ data: { title: "New Chat" } });
      queryClient.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
      setSelectedId(conv.id);
      setMessages([]);
      setDetectedLang(null);
    } catch {
      toast({ title: "Error", description: "Could not create conversation.", variant: "destructive" });
    }
  };

  const handleDeleteConversation = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteConv.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
      if (selectedId === id) { setSelectedId(null); setMessages([]); }
    } catch {
      toast({ title: "Error", description: "Could not delete conversation.", variant: "destructive" });
    }
  };

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isStreaming) return;

    let convId = selectedId;
    if (!convId) {
      try {
        const conv = await createConv.mutateAsync({ data: { title: text.slice(0, 40) } });
        queryClient.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
        convId = conv.id;
        setSelectedId(conv.id);
      } catch {
        toast({ title: "Error", description: "Could not create conversation.", variant: "destructive" });
        return;
      }
    }

    const lang = detectLanguage(text);
    if (lang) setDetectedLang(lang);

    const userMsg: Message = { role: "user", content: text };
    const assistantMsg: Message = { role: "assistant", content: "", streaming: true };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInputText("");
    setIsStreaming(true);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const response = await fetch(`/api/openai/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
        signal: abort.signal,
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          for (const line of chunk.split("\n")) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.content) {
                  fullContent += data.content;
                  setMessages((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last?.streaming) updated[updated.length - 1] = { ...last, content: fullContent };
                    return updated;
                  });
                }
                if (data.done) {
                  setMessages((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last?.streaming) updated[updated.length - 1] = { ...last, streaming: false, content: fullContent };
                    return updated;
                  });
                }
              } catch { /* ignore */ }
            }
          }
        }
      }
      queryClient.invalidateQueries({ queryKey: getGetOpenaiConversationQueryKey(convId) });
      queryClient.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        toast({ title: "Error", description: "Failed to send message.", variant: "destructive" });
        setMessages((prev) => prev.slice(0, -1));
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [inputText, isStreaming, selectedId, createConv, queryClient, toast]);

  const handleVoice = async () => {
    if (isRecording) {
      setIsRecording(false);
      const blob = await stopRecording();
      if (!blob || blob.size === 0) return;

      let convId = selectedId;
      if (!convId) {
        try {
          const conv = await createConv.mutateAsync({ data: { title: "Voice Chat" } });
          queryClient.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
          convId = conv.id;
          setSelectedId(conv.id);
        } catch {
          toast({ title: "Error", description: "Could not create conversation.", variant: "destructive" });
          return;
        }
      }

      // Optimistically add voice messages
      setMessages((prev) => [
        ...prev,
        { role: "user", content: "...", streaming: true, isVoice: true },
        { role: "assistant", content: "", streaming: true, isVoice: true },
      ]);
      setIsStreaming(true);
      setUserTranscriptBuffer("");

      try {
        await streamVoiceResponse(
          `/api/openai/conversations/${convId}/voice-messages`,
          blob
        );
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== "AbortError") {
          toast({ title: "Voice failed", description: err.message, variant: "destructive" });
          setMessages((prev) => prev.slice(0, -2));
          setIsStreaming(false);
        }
      }
    } else {
      setIsRecording(true);
      await startRecording();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="flex h-screen max-h-screen overflow-hidden">
      {/* Conversation sidebar */}
      <div className="w-64 border-r border-border flex flex-col shrink-0 bg-card/30">
        <div className="p-4 border-b border-border">
          <Button onClick={handleNewConversation} className="w-full" size="sm" data-testid="button-new-conversation">
            <Plus className="h-4 w-4 mr-2" />
            New Chat
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {isLoadingConvs ? (
              <div className="space-y-2 p-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : !conversations || conversations.length === 0 ? (
              <div className="text-center py-8 px-2">
                <MessageSquare className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No conversations yet</p>
              </div>
            ) : (
              <AnimatePresence>
                {conversations.map((conv) => (
                  <motion.div
                    key={conv.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    className={`w-full text-left px-3 py-2.5 rounded-md text-sm transition-colors flex items-center justify-between group cursor-pointer ${selectedId === conv.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
                    onClick={() => { setSelectedId(conv.id); setDetectedLang(null); }}
                    data-testid={`button-conversation-${conv.id}`}
                  >
                    <span className="truncate flex-1">{conv.title}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => handleDeleteConversation(conv.id, e)}
                      onKeyDown={(e) => e.key === "Enter" && handleDeleteConversation(conv.id, e as unknown as React.MouseEvent)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </span>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Main chat */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="h-14 border-b border-border px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <span className="font-semibold">MediNova Assistant</span>
            {isSpeaking && (
              <motion.div
                className="flex items-center gap-1 ml-2 text-xs text-primary"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <Volume2 className="h-3.5 w-3.5 animate-pulse" />
                <span>Speaking...</span>
              </motion.div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {detectedLang && (
              <Badge variant="secondary" className="gap-1 text-xs">
                <Globe className="h-3 w-3" />
                {LANG_LABELS[detectedLang] ?? detectedLang}
              </Badge>
            )}
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1">
          <div className="p-6 space-y-4 max-w-3xl mx-auto">
            {!selectedId ? (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center py-20 text-center"
              >
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                  <Bot className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-xl font-semibold mb-2">MediNova Assistant</h2>
                <p className="text-muted-foreground text-sm max-w-sm">
                  Ask about medications, symptoms, or general health guidance. Type or use your voice — in any language.
                </p>
                <div className="flex gap-2 mt-4 flex-wrap justify-center">
                  {["English", "Hindi", "Telugu", "Tamil", "Malayalam"].map((lang) => (
                    <Badge key={lang} variant="outline" className="text-xs">{lang}</Badge>
                  ))}
                </div>
              </motion.div>
            ) : isLoadingMsgs ? (
              <div className="space-y-4">
                {[1, 2].map((i) => <Skeleton key={i} className="h-16 w-3/4" />)}
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <MessageSquare className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground text-sm">Start by typing or pressing the mic to speak.</p>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {messages.map((msg, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {msg.role === "assistant" && (
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                        <Bot className="h-4 w-4 text-primary" />
                      </div>
                    )}
                    <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-card border border-border/50 text-foreground rounded-bl-sm"
                    }`}>
                      {msg.role === "assistant" && msg.isVoice && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                          <Volume2 className="h-3 w-3" />
                          <span>Voice response</span>
                        </div>
                      )}
                      {msg.content || (msg.streaming ? (
                        <span className="flex gap-1 items-center py-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
                        </span>
                      ) : "")}
                      {msg.streaming && msg.content && (
                        <span className="inline-block w-0.5 h-4 bg-current ml-0.5 animate-pulse align-middle" />
                      )}
                    </div>
                    {msg.role === "user" && (
                      <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-1">
                        <User className="h-4 w-4 text-secondary-foreground" />
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        {/* Input bar */}
        <div className="border-t border-border p-4">
          {isRecording && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-center gap-2 mb-3"
            >
              <span className="flex gap-1">
                {[0, 1, 2, 3, 4].map((i) => (
                  <motion.span
                    key={i}
                    className="w-1 rounded-full bg-red-500"
                    animate={{ height: ["8px", "20px", "8px"] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.1 }}
                    style={{ display: "inline-block" }}
                  />
                ))}
              </span>
              <span className="text-sm text-red-400 font-medium">Listening... tap mic to send</span>
            </motion.div>
          )}
          <div className="flex items-center gap-2 max-w-3xl mx-auto">
            <Input
              placeholder="Type a message..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isStreaming || isRecording}
              data-testid="input-chat-message"
              className="flex-1"
            />
            <Button
              variant={isRecording ? "destructive" : "outline"}
              size="icon"
              onClick={handleVoice}
              disabled={isStreaming && !isRecording}
              className={isRecording ? "ring-2 ring-red-500/50" : ""}
              data-testid="button-voice"
            >
              {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!inputText.trim() || isStreaming || isRecording}
              data-testid="button-send"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          {isSpeaking && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-center text-primary mt-2 flex items-center justify-center gap-1"
            >
              <Volume2 className="h-3 w-3 animate-pulse" />
              AI is speaking — audio playing back through your speakers
            </motion.p>
          )}
        </div>
      </div>
    </div>
  );
}
