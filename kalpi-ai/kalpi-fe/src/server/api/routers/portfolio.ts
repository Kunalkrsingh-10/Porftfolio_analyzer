/* eslint-disable */
import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";

// FastAPI runs directly on port 8000 — no Nginx, no /api prefix.
const BACKEND_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

export const portfolioRouter = createTRPCRouter({
  chat: publicProcedure
    .input(z.object({
        sessionId: z.string(),
        userMessage: z.string()
    }))
    .mutation(async ({ input }) => {
      try {
        // Forward request from Next.js server to FastAPI directly (no Nginx).
        // No Authorization header — authentication has been removed.
        const response = await fetch(`${BACKEND_URL}/v1/portfolio/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            session_id: input.sessionId,
            user_message: input.userMessage,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.detail ?? "Failed to connect to AI Portfolio service");
        }

        // Returns: bot_response, active_canvas_view, canvas_data, suggestions, chat_session_id
        return await response.json();
      } catch (error: any) {
        console.error("tRPC Portfolio Chat Error:", error);
        throw new Error(error.message || "Internal server error");
      }
    }),
});
