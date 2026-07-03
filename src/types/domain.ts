// App-level shared types, distinct from the raw DB row shapes in types/supabase.ts

export interface ZaloTemplateParam {
  name: string;
  require: boolean;
  type: string;
  maxLength?: number;
  minLength?: number;
  acceptNull?: boolean;
}

export interface ZaloSendQuota {
  dailyQuota?: string;
  remainingQuota?: string;
}

export interface ZaloPhoneSendResult {
  error: number;
  message: string;
  data?: {
    msg_id?: string;
    sent_time?: string;
    sending_mode?: string;
    quota?: ZaloSendQuota;
  };
}

export interface ZaloUidSendResult {
  error: number;
  message: string;
  data?: {
    message_id?: string;
    user_id?: string;
    sent_time?: string;
    quota?: {
      quota_type: "purchase_quota" | "reward_quota";
      owner_type: "OA" | "App";
      owner_id: string;
    };
  };
}

export interface ImportedRecipientRow {
  rowIndex: number;
  customer_code?: string;
  name?: string;
  phone: string;
  zalo_uid?: string;
  template_data: Record<string, string>;
}
