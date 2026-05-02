import { motion } from "framer-motion";
import { Activity, ShieldCheck, Globe, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LoginScreenProps {
  onLogin: () => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center gap-3"
        >
          <div className="h-16 w-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Activity className="h-8 w-8 text-primary" />
          </div>
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight">MediNova</h1>
            <p className="text-muted-foreground mt-1">Your AI Health Companion</p>
          </div>
        </motion.div>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="grid grid-cols-3 gap-3"
        >
          {[
            { icon: <ShieldCheck className="h-5 w-5" />, label: "Medication\nReminders" },
            { icon: <Mic className="h-5 w-5" />, label: "Voice AI\nAssistant" },
            { icon: <Globe className="h-5 w-5" />, label: "5 Languages\nSupported" },
          ].map((f) => (
            <div
              key={f.label}
              className="flex flex-col items-center gap-2 p-3 rounded-xl bg-card/60 border border-border/50 text-center"
            >
              <div className="text-primary">{f.icon}</div>
              <p className="text-xs text-muted-foreground leading-tight whitespace-pre-line">{f.label}</p>
            </div>
          ))}
        </motion.div>

        {/* Login card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm p-8 space-y-6 shadow-xl"
        >
          <div className="space-y-1 text-center">
            <h2 className="text-xl font-semibold">Welcome back</h2>
            <p className="text-sm text-muted-foreground">
              Sign in to manage your medications and chat with your AI health assistant.
            </p>
          </div>

          <Button
            onClick={onLogin}
            className="w-full h-12 text-base font-medium"
            size="lg"
          >
            Log in to continue
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Your health data is private and secure.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
