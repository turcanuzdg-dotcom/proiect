/**
 * Tipurile bazei de date, în formatul generat de `supabase gen types typescript`.
 * Regenerează-le după orice migrare nouă:
 *   npx supabase gen types typescript --project-id <id> > types/database.ts
 * (apoi păstrează exporturile ajutătoare de la final).
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          timezone: string;
          locale: string;
          default_currency: string;
          default_reminder_days: number[];
          in_app_notifications: boolean;
          email_notifications: boolean;
          tracked_categories: string[];
          onboarding_completed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string;
          timezone?: string;
          locale?: string;
          default_currency?: string;
          default_reminder_days?: number[];
          in_app_notifications?: boolean;
          email_notifications?: boolean;
          tracked_categories?: string[];
          onboarding_completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          timezone?: string;
          locale?: string;
          default_currency?: string;
          default_reminder_days?: number[];
          in_app_notifications?: boolean;
          email_notifications?: boolean;
          tracked_categories?: string[];
          onboarding_completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      family_members: {
        Row: {
          id: string;
          user_id: string;
          full_name: string;
          relationship: string | null;
          birth_date: string | null;
          is_demo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          full_name: string;
          relationship?: string | null;
          birth_date?: string | null;
          is_demo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          full_name?: string;
          relationship?: string | null;
          birth_date?: string | null;
          is_demo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      documents: {
        Row: {
          id: string;
          user_id: string;
          family_member_id: string | null;
          title: string;
          category: string;
          issuer: string | null;
          notes: string | null;
          issue_date: string | null;
          expiry_date: string | null;
          currency: string | null;
          amount: number | null;
          renewal_url: string | null;
          file_path: string | null;
          file_name: string | null;
          file_mime_type: string | null;
          is_demo: boolean;
          created_at: string;
          updated_at: string;
          archived_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          family_member_id?: string | null;
          title: string;
          category: string;
          issuer?: string | null;
          notes?: string | null;
          issue_date?: string | null;
          expiry_date?: string | null;
          currency?: string | null;
          amount?: number | null;
          renewal_url?: string | null;
          file_path?: string | null;
          file_name?: string | null;
          file_mime_type?: string | null;
          is_demo?: boolean;
          created_at?: string;
          updated_at?: string;
          archived_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          family_member_id?: string | null;
          title?: string;
          category?: string;
          issuer?: string | null;
          notes?: string | null;
          issue_date?: string | null;
          expiry_date?: string | null;
          currency?: string | null;
          amount?: number | null;
          renewal_url?: string | null;
          file_path?: string | null;
          file_name?: string | null;
          file_mime_type?: string | null;
          is_demo?: boolean;
          created_at?: string;
          updated_at?: string;
          archived_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "documents_family_member_id_fkey";
            columns: ["family_member_id"];
            isOneToOne: false;
            referencedRelation: "family_members";
            referencedColumns: ["id"];
          },
        ];
      };
      reminder_preferences: {
        Row: {
          id: string;
          user_id: string;
          document_id: string;
          days_before: number;
          enabled: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          document_id: string;
          days_before: number;
          enabled?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          document_id?: string;
          days_before?: number;
          enabled?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reminder_preferences_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
      reminders: {
        Row: {
          id: string;
          user_id: string;
          document_id: string | null;
          title: string;
          body: string | null;
          remind_at: string;
          status: string;
          channel: string;
          days_before: number | null;
          snoozed_until: string | null;
          completed_at: string | null;
          read_at: string | null;
          emailed_at: string | null;
          is_demo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          document_id?: string | null;
          title: string;
          body?: string | null;
          remind_at: string;
          status?: string;
          channel?: string;
          days_before?: number | null;
          snoozed_until?: string | null;
          completed_at?: string | null;
          read_at?: string | null;
          emailed_at?: string | null;
          is_demo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          document_id?: string | null;
          title?: string;
          body?: string | null;
          remind_at?: string;
          status?: string;
          channel?: string;
          days_before?: number | null;
          snoozed_until?: string | null;
          completed_at?: string | null;
          read_at?: string | null;
          emailed_at?: string | null;
          is_demo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reminders_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
      renewals: {
        Row: {
          id: string;
          user_id: string;
          document_id: string;
          previous_expiry_date: string | null;
          new_expiry_date: string | null;
          previous_file_path: string | null;
          previous_file_name: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          document_id: string;
          previous_expiry_date?: string | null;
          new_expiry_date?: string | null;
          previous_file_path?: string | null;
          previous_file_name?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          document_id?: string;
          previous_expiry_date?: string | null;
          new_expiry_date?: string | null;
          previous_file_path?: string | null;
          previous_file_name?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "renewals_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
      activity_logs: {
        Row: {
          id: string;
          user_id: string;
          document_id: string | null;
          action: string;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          document_id?: string | null;
          action: string;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          document_id?: string | null;
          action?: string;
          metadata?: Json | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activity_logs_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      save_document: {
        Args: {
          p_document_id: string | null;
          p_document: Json;
          p_reminder_days: Json;
          p_reminders: Json;
          p_is_demo?: boolean;
        };
        Returns: string;
      };
      renew_document: {
        Args: {
          p_document_id: string;
          p_new_expiry_date: string;
          p_note: string | null;
          p_file: Json | null;
          p_reminders: Json;
        };
        Returns: string;
      };
      seed_demo_data: {
        Args: { p_family_member: Json; p_documents: Json };
        Returns: number;
      };
      remove_demo_data: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      delete_my_data: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      owns_document: {
        Args: { p_document_id: string };
        Returns: boolean;
      };
      owns_family_member: {
        Args: { p_family_member_id: string };
        Returns: boolean;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];

export type ProfileRow = Tables<"profiles">;
export type FamilyMemberRow = Tables<"family_members">;
export type DocumentRow = Tables<"documents">;
export type ReminderPreferenceRow = Tables<"reminder_preferences">;
export type ReminderRow = Tables<"reminders">;
export type RenewalRow = Tables<"renewals">;
export type ActivityLogRow = Tables<"activity_logs">;
