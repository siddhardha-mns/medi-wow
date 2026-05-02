import React, { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Pill, Bot, Mic, MicOff, ChevronRight, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVoiceRecorder } from "@workspace/integrations-openai-ai-react/audio";
import { useCreateOpenaiConversation, getListOpenaiConversationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.12, duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  }),
};

const cardHover = {
  rest: { scale: 1, y: 0 },
  hover: { scale: 1.025, y: -4, transition: { duration: 0.2, ease: "easeOut" } },
};

export default function Dashboard() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createConv = useCreateOpenaiConversation();
  const { state: recState, startRecording, stopRecording } = useVoiceRecorder();
  const [isRecording, setIsRecording] = useState(false);
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);

  const goToChat = () => navigate("/chat");
  const goToReminders = () => navigate("/reminders");

  const handleMicClick = async () => {
    if (isRecording) {
      setIsRecording(false);
      const blob = await stopRecording();
      if (blob && blob.size > 0) {
        try {
          const conv = await createConv.mutateAsync({ data: { title: "Voice Chat" } });
          queryClient.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
          navigate(`/chat?voice=${conv.id}`);
          setPendingBlob(blob);
        } catch {
          toast({ title: "Error", description: "Could not start voice chat.", variant: "destructive" });
        }
      }
    } else {
      setIsRecording(true);
      await startRecording();
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 py-12 relative overflow-hidden">
      {/* Ambient background blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-blue-500/5 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-2xl flex flex-col items-center gap-10">
        {/* Header */}
        <motion.div
          className="flex flex-col items-center gap-3 text-center"
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          custom={0}
        >
          <div className="flex items-center gap-2 mb-1">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Activity className="h-5 w-5 text-primary" />
            </div>
            <span className="text-2xl font-bold tracking-tight">MediNova</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight leading-tight">
            Your AI Health<br />Companion
          </h1>
          <p className="text-muted-foreground text-lg max-w-sm">
            Smart medication reminders and a voice-enabled medical assistant — in your language.
          </p>
        </motion.div>

        {/* Main Cards */}
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-4">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            custom={1}
          >
            <motion.button
              variants={cardHover}
              initial="rest"
              whileHover="hover"
              whileTap={{ scale: 0.98 }}
              onClick={goToReminders}
              className="w-full text-left rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm p-6 flex flex-col gap-4 shadow-sm hover:border-primary/40 hover:bg-card/80 transition-colors group"
              data-testid="card-reminders"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <Pill className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold mb-1">Medical Reminders</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Set up your medication schedule and track doses with smart reminders.
                </p>
              </div>
              <div className="flex items-center gap-1 text-sm text-primary font-medium">
                Manage reminders
                <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </motion.button>
          </motion.div>

          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            custom={2}
          >
            <motion.button
              variants={cardHover}
              initial="rest"
              whileHover="hover"
              whileTap={{ scale: 0.98 }}
              onClick={goToChat}
              className="w-full text-left rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm p-6 flex flex-col gap-4 shadow-sm hover:border-blue-500/40 hover:bg-card/80 transition-colors group"
              data-testid="card-chat"
            >
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                <Bot className="h-6 w-6 text-blue-500" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold mb-1">AI Chat Assistant</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Ask health questions in English, Hindi, Telugu, Tamil, Malayalam and more.
                </p>
              </div>
              <div className="flex items-center gap-1 text-sm text-blue-500 font-medium">
                Open assistant
                <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </motion.button>
          </motion.div>
        </div>

        {/* Language badges */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          custom={3}
          className="flex items-center gap-2 flex-wrap justify-center"
        >
          <span className="text-xs text-muted-foreground">Supports:</span>
          {["English", "Hindi", "Telugu", "Tamil", "Malayalam"].map((lang) => (
            <span key={lang} className="text-xs px-2.5 py-1 rounded-full border border-border/60 text-muted-foreground">
              {lang}
            </span>
          ))}
        </motion.div>
      </div>

      {/* Floating Mic Button */}
      <motion.div
        className="fixed bottom-8 right-8 z-20"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleMicClick}
          className={`relative w-16 h-16 rounded-full shadow-2xl flex items-center justify-center transition-colors ${
            isRecording
              ? "bg-red-500 text-white"
              : "bg-primary text-primary-foreground"
          }`}
          data-testid="button-floating-mic"
        >
          {isRecording && (
            <motion.span
              className="absolute inset-0 rounded-full bg-red-500 opacity-40"
              animate={{ scale: [1, 1.5, 1], opacity: [0.4, 0, 0.4] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          )}
          {isRecording ? <MicOff className="h-7 w-7" /> : <Mic className="h-7 w-7" />}
        </motion.button>
        {!isRecording && (
          <motion.p
            className="absolute -top-8 left-1/2 -translate-x-1/2 text-xs text-muted-foreground whitespace-nowrap"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
          >
            Quick voice
          </motion.p>
        )}
        {isRecording && (
          <motion.p
            className="absolute -top-8 left-1/2 -translate-x-1/2 text-xs text-red-400 whitespace-nowrap animate-pulse"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            Listening...
          </motion.p>
        )}
      </motion.div>
    </div>
  );
}
