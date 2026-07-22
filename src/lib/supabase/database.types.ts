export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string;
          actor_type: string;
          actor_user_id: string | null;
          clinic_id: string | null;
          created_at: string;
          diff: Json | null;
          id: number;
          ip: unknown;
          target_id: string | null;
          target_type: string | null;
          user_agent: string | null;
        };
        Insert: {
          action: string;
          actor_type: string;
          actor_user_id?: string | null;
          clinic_id?: string | null;
          created_at?: string;
          diff?: Json | null;
          id?: never;
          ip?: unknown;
          target_id?: string | null;
          target_type?: string | null;
          user_agent?: string | null;
        };
        Update: {
          action?: string;
          actor_type?: string;
          actor_user_id?: string | null;
          clinic_id?: string | null;
          created_at?: string;
          diff?: Json | null;
          id?: never;
          ip?: unknown;
          target_id?: string | null;
          target_type?: string | null;
          user_agent?: string | null;
        };
        Relationships: [];
      };
      booking_access_tokens: {
        Row: {
          booking_id: string;
          created_at: string;
          expires_at: string;
          id: string;
          purpose: string;
          token_hash: string;
          used_at: string | null;
        };
        Insert: {
          booking_id: string;
          created_at?: string;
          expires_at: string;
          id?: string;
          purpose: string;
          token_hash: string;
          used_at?: string | null;
        };
        Update: {
          booking_id?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          purpose?: string;
          token_hash?: string;
          used_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "booking_access_tokens_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
        ];
      };
      booking_sessions: {
        Row: {
          booking_id: string;
          clinic_id: string;
          created_at: string;
          id: string;
          kind: string;
          label: string | null;
          member_id: string | null;
          occupied_range: unknown;
          room_id: string | null;
          schedule_block_id: string | null;
          seq: number;
          status: string;
          time_range: unknown;
          updated_at: string;
        };
        Insert: {
          booking_id: string;
          clinic_id: string;
          created_at?: string;
          id?: string;
          kind?: string;
          label?: string | null;
          member_id?: string | null;
          occupied_range: unknown;
          room_id?: string | null;
          schedule_block_id?: string | null;
          seq?: number;
          status?: string;
          time_range?: unknown;
          updated_at?: string;
        };
        Update: {
          booking_id?: string;
          clinic_id?: string;
          created_at?: string;
          id?: string;
          kind?: string;
          label?: string | null;
          member_id?: string | null;
          occupied_range?: unknown;
          room_id?: string | null;
          schedule_block_id?: string | null;
          seq?: number;
          status?: string;
          time_range?: unknown;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "booking_sessions_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "booking_sessions_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "booking_sessions_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "clinic_members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "booking_sessions_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "booking_sessions_schedule_block_id_fkey";
            columns: ["schedule_block_id"];
            isOneToOne: false;
            referencedRelation: "schedule_blocks";
            referencedColumns: ["id"];
          },
        ];
      };
      bookings: {
        Row: {
          booking_no: string;
          cancel_reason: string | null;
          cancelled_at: string | null;
          clinic_id: string;
          created_at: string;
          created_by: string | null;
          guest_email: string | null;
          guest_kana: string | null;
          guest_name: string | null;
          guest_phone: string | null;
          id: string;
          nominated_member_id: string | null;
          notes: string | null;
          patient_id: string | null;
          service_id: string;
          source: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          booking_no?: string;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          clinic_id: string;
          created_at?: string;
          created_by?: string | null;
          guest_email?: string | null;
          guest_kana?: string | null;
          guest_name?: string | null;
          guest_phone?: string | null;
          id?: string;
          nominated_member_id?: string | null;
          notes?: string | null;
          patient_id?: string | null;
          service_id: string;
          source?: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          booking_no?: string;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          clinic_id?: string;
          created_at?: string;
          created_by?: string | null;
          guest_email?: string | null;
          guest_kana?: string | null;
          guest_name?: string | null;
          guest_phone?: string | null;
          id?: string;
          nominated_member_id?: string | null;
          notes?: string | null;
          patient_id?: string | null;
          service_id?: string;
          source?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bookings_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_nominated_member_id_fkey";
            columns: ["nominated_member_id"];
            isOneToOne: false;
            referencedRelation: "clinic_members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
        ];
      };
      clinic_closures: {
        Row: {
          clinic_id: string;
          date: string;
          id: string;
          note: string | null;
        };
        Insert: {
          clinic_id: string;
          date: string;
          id?: string;
          note?: string | null;
        };
        Update: {
          clinic_id?: string;
          date?: string;
          id?: string;
          note?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "clinic_closures_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      clinic_members: {
        Row: {
          clinic_id: string;
          created_at: string;
          display_name: string | null;
          employment_type: string | null;
          id: string;
          is_bookable: boolean;
          roles: string[];
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          clinic_id: string;
          created_at?: string;
          display_name?: string | null;
          employment_type?: string | null;
          id?: string;
          is_bookable?: boolean;
          roles?: string[];
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          clinic_id?: string;
          created_at?: string;
          display_name?: string | null;
          employment_type?: string | null;
          id?: string;
          is_bookable?: boolean;
          roles?: string[];
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clinic_members_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "clinic_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      clinics: {
        Row: {
          address: string | null;
          booking_approval_mode: string;
          business_hours: Json;
          cancel_deadline_hours: number;
          created_at: string;
          director_name: string | null;
          email: string | null;
          id: string;
          name: string;
          phone: string | null;
          postal_code: string | null;
          public_booking_enabled: boolean;
          settings: Json;
          slug: string;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          booking_approval_mode?: string;
          business_hours?: Json;
          cancel_deadline_hours?: number;
          created_at?: string;
          director_name?: string | null;
          email?: string | null;
          id?: string;
          name: string;
          phone?: string | null;
          postal_code?: string | null;
          public_booking_enabled?: boolean;
          settings?: Json;
          slug: string;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          booking_approval_mode?: string;
          business_hours?: Json;
          cancel_deadline_hours?: number;
          created_at?: string;
          director_name?: string | null;
          email?: string | null;
          id?: string;
          name?: string;
          phone?: string | null;
          postal_code?: string | null;
          public_booking_enabled?: boolean;
          settings?: Json;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      invitations: {
        Row: {
          accepted_at: string | null;
          clinic_id: string;
          created_at: string;
          created_by: string | null;
          email: string;
          employment_type: string | null;
          expires_at: string;
          id: string;
          roles: string[];
          token_hash: string;
        };
        Insert: {
          accepted_at?: string | null;
          clinic_id: string;
          created_at?: string;
          created_by?: string | null;
          email: string;
          employment_type?: string | null;
          expires_at: string;
          id?: string;
          roles?: string[];
          token_hash: string;
        };
        Update: {
          accepted_at?: string | null;
          clinic_id?: string;
          created_at?: string;
          created_by?: string | null;
          email?: string;
          employment_type?: string | null;
          expires_at?: string;
          id?: string;
          roles?: string[];
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invitations_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitations_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          booking_id: string | null;
          clinic_id: string;
          created_at: string;
          error: string | null;
          id: string;
          kind: string;
          payload: Json;
          recipient_email: string;
          recipient_type: string;
          sent_at: string | null;
          status: string;
        };
        Insert: {
          booking_id?: string | null;
          clinic_id: string;
          created_at?: string;
          error?: string | null;
          id?: string;
          kind: string;
          payload?: Json;
          recipient_email: string;
          recipient_type: string;
          sent_at?: string | null;
          status?: string;
        };
        Update: {
          booking_id?: string | null;
          clinic_id?: string;
          created_at?: string;
          error?: string | null;
          id?: string;
          kind?: string;
          payload?: Json;
          recipient_email?: string;
          recipient_type?: string;
          sent_at?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      patients: {
        Row: {
          birthdate: string | null;
          clinic_id: string;
          created_at: string;
          email: string | null;
          external_chart_no: string | null;
          id: string;
          kana: string | null;
          name: string;
          notes: string | null;
          phone: string | null;
          tags: string[];
          updated_at: string;
        };
        Insert: {
          birthdate?: string | null;
          clinic_id: string;
          created_at?: string;
          email?: string | null;
          external_chart_no?: string | null;
          id?: string;
          kana?: string | null;
          name: string;
          notes?: string | null;
          phone?: string | null;
          tags?: string[];
          updated_at?: string;
        };
        Update: {
          birthdate?: string | null;
          clinic_id?: string;
          created_at?: string;
          email?: string | null;
          external_chart_no?: string | null;
          id?: string;
          kana?: string | null;
          name?: string;
          notes?: string | null;
          phone?: string | null;
          tags?: string[];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "patients_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          full_name: string;
          id: string;
          is_ops: boolean;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          full_name?: string;
          id: string;
          is_ops?: boolean;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          full_name?: string;
          id?: string;
          is_ops?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      questionnaire_responses: {
        Row: {
          answers: Json;
          booking_id: string;
          clinic_id: string;
          created_at: string;
          id: string;
          submitted_at: string | null;
          template_id: string;
          updated_at: string;
        };
        Insert: {
          answers?: Json;
          booking_id: string;
          clinic_id: string;
          created_at?: string;
          id?: string;
          submitted_at?: string | null;
          template_id: string;
          updated_at?: string;
        };
        Update: {
          answers?: Json;
          booking_id?: string;
          clinic_id?: string;
          created_at?: string;
          id?: string;
          submitted_at?: string | null;
          template_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "questionnaire_responses_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "questionnaire_responses_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "questionnaire_responses_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "questionnaire_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      questionnaire_templates: {
        Row: {
          clinic_id: string;
          created_at: string;
          id: string;
          name: string;
          questions: Json;
          status: string;
          updated_at: string;
        };
        Insert: {
          clinic_id: string;
          created_at?: string;
          id?: string;
          name: string;
          questions?: Json;
          status?: string;
          updated_at?: string;
        };
        Update: {
          clinic_id?: string;
          created_at?: string;
          id?: string;
          name?: string;
          questions?: Json;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "questionnaire_templates_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      rooms: {
        Row: {
          clinic_id: string;
          id: string;
          name: string;
          sort_order: number;
          status: string;
        };
        Insert: {
          clinic_id: string;
          id?: string;
          name: string;
          sort_order?: number;
          status?: string;
        };
        Update: {
          clinic_id?: string;
          id?: string;
          name?: string;
          sort_order?: number;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rooms_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      schedule_blocks: {
        Row: {
          block_type: string;
          clinic_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          member_id: string;
          note: string | null;
          room_id: string;
          time_range: unknown;
          updated_at: string;
        };
        Insert: {
          block_type?: string;
          clinic_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          member_id: string;
          note?: string | null;
          room_id: string;
          time_range: unknown;
          updated_at?: string;
        };
        Update: {
          block_type?: string;
          clinic_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          member_id?: string;
          note?: string | null;
          room_id?: string;
          time_range?: unknown;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "schedule_blocks_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "schedule_blocks_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "schedule_blocks_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "clinic_members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "schedule_blocks_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
        ];
      };
      service_categories: {
        Row: {
          clinic_id: string;
          id: string;
          name: string;
          sort_order: number;
        };
        Insert: {
          clinic_id: string;
          id?: string;
          name: string;
          sort_order?: number;
        };
        Update: {
          clinic_id?: string;
          id?: string;
          name?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "service_categories_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      services: {
        Row: {
          allow_nomination: boolean;
          category_id: string | null;
          clinic_id: string;
          created_at: string;
          description: string | null;
          id: string;
          is_public: boolean;
          kind: string;
          name: string;
          price_yen: number | null;
          questionnaire_template_id: string | null;
          session_template: Json;
          show_price: boolean;
          sort_order: number;
          status: string;
          updated_at: string;
        };
        Insert: {
          allow_nomination?: boolean;
          category_id?: string | null;
          clinic_id: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_public?: boolean;
          kind?: string;
          name: string;
          price_yen?: number | null;
          questionnaire_template_id?: string | null;
          session_template?: Json;
          show_price?: boolean;
          sort_order?: number;
          status?: string;
          updated_at?: string;
        };
        Update: {
          allow_nomination?: boolean;
          category_id?: string | null;
          clinic_id?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_public?: boolean;
          kind?: string;
          name?: string;
          price_yen?: number | null;
          questionnaire_template_id?: string | null;
          session_template?: Json;
          show_price?: boolean;
          sort_order?: number;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "services_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "service_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "services_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "services_questionnaire_template_id_fkey";
            columns: ["questionnaire_template_id"];
            isOneToOne: false;
            referencedRelation: "questionnaire_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      staff_service_assignments: {
        Row: {
          clinic_id: string;
          id: string;
          member_id: string;
          service_id: string;
        };
        Insert: {
          clinic_id: string;
          id?: string;
          member_id: string;
          service_id: string;
        };
        Update: {
          clinic_id?: string;
          id?: string;
          member_id?: string;
          service_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_service_assignments_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_service_assignments_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "clinic_members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_service_assignments_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
        ];
      };
      worker_jobs: {
        Row: {
          attempts: number;
          created_at: string;
          id: string;
          kind: string;
          last_error: string | null;
          payload: Json;
          run_at: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          attempts?: number;
          created_at?: string;
          id?: string;
          kind: string;
          last_error?: string | null;
          payload?: Json;
          run_at?: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          attempts?: number;
          created_at?: string;
          id?: string;
          kind?: string;
          last_error?: string | null;
          payload?: Json;
          run_at?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      cancel_booking: {
        Args: { p_booking_id: string; p_clinic_id: string; p_reason?: string };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
