"use client";

import * as React from "react";
import { useAIChat, useChatHistory } from "@/lib/queries";
import type { ChatMessage } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bot,
  Send,
  Sparkles,
  MessageCircle,
  User,
  Lightbulb,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const QUICK_SUGGESTIONS = [
  "Aaj ki sale batao",
  "Low stock parts",
  "Top selling products",
  "Stock value kya hai?",
];

const EXAMPLE_QUESTIONS = [
  "Splendor ka brake shoe kahan hai?",
  "Aaj kitni sale hui?",
  "Kaunsa part stock kam hai?",
  "Chain kit ka price kya rakhu?",
];

function timeFmt(d: string) {
  try {
    return new Date(d).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function LoadingDots() {
  return (
    <div className="flex items-center gap-1 py-1.5" aria-label="ShopMitra soch raha hai">
      <span className="size-2 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:-0.3s]" />
      <span className="size-2 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:-0.15s]" />
      <span className="size-2 animate-bounce rounded-full bg-muted-foreground/70" />
    </div>
  );
}

export function AIAssistantView() {
  const { data, isLoading } = useChatHistory();
  const chat = useAIChat();
  const [input, setInput] = React.useState("");
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const messages: ChatMessage[] = data?.messages ?? [];

  // Auto-scroll on new message or loading state change
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages.length, chat.isPending]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || chat.isPending) return;
    const history = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    chat.mutate({ message: trimmed, history });
    setInput("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send(input);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="overflow-hidden border-border shadow-soft">
        <CardContent className="flex items-center gap-3 p-4 sm:gap-4 sm:p-5">
          <div className="relative shrink-0">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Bot className="size-6" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-card">
              <span className="size-1.5 animate-pulse rounded-full bg-white" />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg font-bold tracking-tight sm:text-xl">
                ShopMitra AI
              </h1>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                <Sparkles className="size-3" />
                Beta
              </span>
            </div>
            <p className="truncate text-xs text-muted-foreground sm:text-sm">
              Aapke dukaan ka AI saathi · Inventory, sales aur pricing mein madad
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Chat Card */}
      <Card className="flex flex-col border-border shadow-soft">
        {/* Messages */}
        <div
          ref={scrollRef}
          className="max-h-[60vh] min-h-[280px] overflow-y-auto scroll-thin p-3 sm:p-4"
        >
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => {
                const isUser = i % 2 === 1;
                return (
                  <div
                    key={i}
                    className={cn(
                      "flex items-end gap-2",
                      isUser ? "flex-row-reverse" : "flex-row"
                    )}
                  >
                    <Skeleton className="size-8 shrink-0 rounded-full" />
                    <Skeleton
                      className={cn(
                        "h-12 rounded-2xl",
                        isUser ? "w-1/2" : "w-2/3"
                      )}
                    />
                  </div>
                );
              })}
            </div>
          ) : messages.length === 0 && !chat.isPending ? (
            <EmptyState onPick={send} />
          ) : (
            <div className="space-y-3">
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}

              {/* Optimistic user message while waiting for history refresh */}
              {chat.isPending && chat.variables && (
                <MessageBubble
                  message={{
                    id: "pending-user",
                    userId: "",
                    role: "user",
                    content: chat.variables.message,
                    createdAt: new Date().toISOString(),
                  }}
                />
              )}

              {/* Assistant loading bubble */}
              {chat.isPending && (
                <div className="flex items-end gap-2">
                  <Avatar role="assistant" />
                  <div className="rounded-2xl rounded-bl-md border border-border bg-muted/60 px-4 py-1 shadow-sm">
                    <LoadingDots />
                  </div>
                </div>
              )}

              {/* Error state */}
              {chat.isError && (
                <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-600 dark:text-red-400">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>
                    Kuch gadbad ho gayi. Phir try karo.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quick chips */}
        <div className="border-t border-border bg-card/50 px-3 pt-3 sm:px-4">
          <div className="flex gap-2 overflow-x-auto scroll-thin pb-3">
            {QUICK_SUGGESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => send(q)}
                disabled={chat.isPending}
                className={cn(
                  "touch-target inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium transition-all hover:border-primary/50 hover:bg-primary/5 hover:text-primary active:scale-95",
                  "disabled:pointer-events-none disabled:opacity-50"
                )}
              >
                <Sparkles className="size-3 text-primary" />
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Input */}
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 border-t border-border p-3 sm:p-4"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="ShopMitra se kuch pucho..."
            disabled={chat.isPending}
            autoComplete="off"
            className="h-12 flex-1 rounded-xl border-border bg-background text-base shadow-sm"
          />
          <Button
            type="submit"
            size="icon"
            disabled={chat.isPending || !input.trim()}
            className="h-12 w-12 shrink-0 rounded-xl"
            aria-label="Send message"
          >
            <Send className="size-5" />
          </Button>
        </form>
      </Card>
    </div>
  );
}

function Avatar({ role }: { role: string }) {
  const isUser = role === "user";
  return (
    <div
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full ring-2 ring-card",
        isUser
          ? "bg-primary text-primary-foreground"
          : "bg-primary/10 text-primary"
      )}
    >
      {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div
      className={cn(
        "flex items-end gap-2",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      <Avatar role={message.role} />
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-sm sm:max-w-[75%]",
          isUser
            ? "rounded-br-md bg-primary text-primary-foreground"
            : "rounded-bl-md border border-border bg-muted/60"
        )}
      >
        <p className="whitespace-pre-wrap break-words leading-relaxed">
          {message.content}
        </p>
        <p
          className={cn(
            "mt-1 text-[10px]",
            isUser ? "text-primary-foreground/70" : "text-muted-foreground"
          )}
        >
          {timeFmt(message.createdAt)}
        </p>
      </div>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="flex flex-col items-center py-4 text-center sm:py-8">
      <div className="relative mb-4">
        <div className="flex size-16 items-center justify-center rounded-3xl bg-primary/10 text-primary">
          <Bot className="size-8" />
        </div>
        <span className="absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full bg-card shadow-soft">
          <Sparkles className="size-3.5 text-amber-500" />
        </span>
      </div>
      <h2 className="text-lg font-bold tracking-tight">
        Namaste! Main ShopMitra hoon 🙏
      </h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Aapke dukaan ka AI saathi hoon. Inventory, sales, stock aur pricing ke
        baare mein kuch bhi poocho — main turant jawab dunga!
      </p>

      <div className="mt-5 w-full max-w-md space-y-2">
        <div className="mb-2 flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Lightbulb className="size-3.5 text-amber-500" />
          Try these examples
        </div>
        {EXAMPLE_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            className="touch-target flex w-full items-center gap-3 rounded-xl border border-border bg-background p-3 text-left text-sm shadow-sm transition-all hover:border-primary/40 hover:bg-primary/5 active:scale-[0.98]"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MessageCircle className="size-4" />
            </span>
            <span className="flex-1 font-medium">{q}</span>
            <Send className="size-4 shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}

export default AIAssistantView;
