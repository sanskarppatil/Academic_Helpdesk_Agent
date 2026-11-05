"use client";

import { create } from "zustand";

export type ReviewTicket = {
  sequence: number;
  event_sequence: number;
  ticket_id: string;
  question: string;
  reason: string;
  evidence: Array<{
    citation?: string;
    similarity?: number | null;
    summary?: string;
  }>;
  status: "open" | "claimed" | "answered" | "closed";
  occurrence_count: number;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
  assigned_admin: string | null;
  resolution: string | null;
  resolved_at: string | null;
  published_at: string | null;
};

type AdminStore = {
  token: string;
  tickets: ReviewTicket[];
  loading: boolean;
  error: string;
  socketConnected: boolean;
  setToken: (token: string) => void;
  setTickets: (tickets: ReviewTicket[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string) => void;
  setSocketConnected: (connected: boolean) => void;
  clear: () => void;
};

export const useAdminStore = create<AdminStore>((set) => ({
  token: "",
  tickets: [],
  loading: false,
  error: "",
  socketConnected: false,
  setToken: (token) => set({ token }),
  setTickets: (tickets) => set({ tickets }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setSocketConnected: (socketConnected) => set({ socketConnected }),
  clear: () =>
    set({
      token: "",
      tickets: [],
      loading: false,
      error: "",
      socketConnected: false,
    }),
}));
