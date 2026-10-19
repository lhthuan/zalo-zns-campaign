import { create } from "zustand";

export type RecipientMode = "directory" | "manual";

export interface DirectoryCustomer {
  id: string;
  name: string | null;
  phone: string | null;
  zalo_uid: string | null;
}

interface SendTestDraft {
  templateId: string;
  paramValues: Record<string, string>;
  recipientMode: RecipientMode;
  selectedCustomer: DirectoryCustomer | null;
  manualName: string;
  manualPhone: string;
  set: (patch: Partial<Omit<SendTestDraft, "set" | "setParam">>) => void;
  setParam: (name: string, value: string) => void;
}

/**
 * The single-send form's draft. In memory only (not persisted) so customer
 * phone numbers never land in browser storage, but it survives navigating to
 * another page and back within the session.
 */
export const useSendTestStore = create<SendTestDraft>()((set) => ({
  templateId: "",
  paramValues: {},
  recipientMode: "directory",
  selectedCustomer: null,
  manualName: "",
  manualPhone: "",
  set: (patch) => set(patch),
  setParam: (name, value) => set((s) => ({ paramValues: { ...s.paramValues, [name]: value } })),
}));
