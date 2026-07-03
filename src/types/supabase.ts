// Hand-authored to match supabase/schema.sql. Once the real Supabase project
// exists, regenerate with:
//   npx supabase gen types typescript --project-id <ref> --schema public > src/types/supabase.ts

export type ProfileRole = "admin" | "staff";
export type TemplateStatus = "ENABLE" | "PENDING_REVIEW" | "REJECT" | "DISABLE";
export type CampaignStatus =
  | "draft"
  | "sending"
  | "completed"
  | "completed_with_errors"
  | "failed";
export type SendMode = "uid" | "phone";
export type RecipientStatus = "pending" | "sent" | "failed";
export type CampaignCreationMode = "broadcast" | "custom";
export type ZnsPricingTag = "TRANSACTION" | "CUSTOMER_CARE" | "PROMOTION" | "OTHER";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          role: ProfileRole;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          role?: ProfileRole;
        };
        Update: {
          role?: ProfileRole;
        };
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          customer_code: string | null;
          name: string;
          phone: string | null;
          zalo_uid: string | null;
          import_batch: string | null;
          extra_fields: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_code?: string | null;
          name: string;
          phone?: string | null;
          zalo_uid?: string | null;
          import_batch?: string | null;
          extra_fields?: Record<string, unknown>;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["customers"]["Insert"]>;
        Relationships: [];
      };
      zalo_templates: {
        Row: {
          id: string;
          template_id: string;
          template_name: string;
          status: TemplateStatus;
          tag: string | null;
          template_data_schema: unknown;
          created_at: string;
          updated_at: string;
          last_synced_at: string | null;
        };
        Insert: {
          id?: string;
          template_id: string;
          template_name: string;
          status: TemplateStatus;
          tag?: string | null;
          template_data_schema?: unknown;
          last_synced_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["zalo_templates"]["Insert"]>;
        Relationships: [];
      };
      zalo_oauth_tokens: {
        Row: {
          id: number;
          access_token: string;
          refresh_token: string;
          expires_at: string;
          locked_until: string | null;
          updated_at: string;
        };
        Insert: {
          id?: number;
          access_token: string;
          refresh_token: string;
          expires_at: string;
          locked_until?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["zalo_oauth_tokens"]["Insert"]>;
        Relationships: [];
      };
      app_settings: {
        Row: {
          id: number;
          zalo_app_id: string | null;
          zalo_app_secret_key: string | null;
          updated_at: string;
        };
        Insert: {
          id?: number;
          zalo_app_id?: string | null;
          zalo_app_secret_key?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["app_settings"]["Insert"]>;
        Relationships: [];
      };
      campaigns: {
        Row: {
          id: string;
          name: string;
          template_id: string;
          status: CampaignStatus;
          total_recipients: number;
          sent_count: number;
          failed_count: number;
          source_file_name: string | null;
          is_hidden: boolean;
          creation_mode: CampaignCreationMode | null;
          customer_batch: string | null;
          fixed_template_data: Record<string, unknown> | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          template_id: string;
          status?: CampaignStatus;
          total_recipients?: number;
          sent_count?: number;
          failed_count?: number;
          source_file_name?: string | null;
          is_hidden?: boolean;
          creation_mode?: CampaignCreationMode | null;
          customer_batch?: string | null;
          fixed_template_data?: Record<string, unknown> | null;
          created_by?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["campaigns"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "campaigns_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "zalo_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      campaign_recipients: {
        Row: {
          id: string;
          campaign_id: string;
          customer_id: string | null;
          phone: string | null;
          zalo_uid: string | null;
          template_data: Record<string, unknown>;
          send_mode: SendMode;
          tracking_id: string;
          batch_number: number;
          status: RecipientStatus;
          zalo_msg_id: string | null;
          error_code: string | null;
          error_message: string | null;
          sent_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          customer_id?: string | null;
          phone?: string | null;
          zalo_uid?: string | null;
          template_data: Record<string, unknown>;
          send_mode: SendMode;
          tracking_id: string;
          batch_number: number;
          status?: RecipientStatus;
        };
        Update: Partial<Database["public"]["Tables"]["campaign_recipients"]["Insert"]> & {
          zalo_msg_id?: string | null;
          error_code?: string | null;
          error_message?: string | null;
          sent_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "campaigns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "campaign_recipients_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
        ];
      };
      zns_pricing: {
        Row: {
          tag: ZnsPricingTag;
          price_vnd: number;
          updated_at: string;
        };
        Insert: {
          tag: ZnsPricingTag;
          price_vnd?: number;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["zns_pricing"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      customer_import_batches: {
        Args: Record<string, never>;
        Returns: {
          import_batch: string;
          customer_count: number;
          last_imported_at: string;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
