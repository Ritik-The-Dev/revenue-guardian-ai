export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          case_id: string | null
          created_at: string
          decision: string | null
          event_type: string
          id: string
          metadata: Json
          reason: string | null
        }
        Insert: {
          case_id?: string | null
          created_at?: string
          decision?: string | null
          event_type: string
          id?: string
          metadata?: Json
          reason?: string | null
        }
        Update: {
          case_id?: string | null
          created_at?: string
          decision?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "recovery_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          communication_preference: Database["public"]["Enums"]["communication_preference"]
          created_at: string
          email: string | null
          external_customer_id: string | null
          failed_payments: number
          id: string
          last_successful_payment_at: string | null
          lifetime_value: number
          name: string | null
          phone: string | null
          successful_payments: number
          updated_at: string
        }
        Insert: {
          communication_preference?: Database["public"]["Enums"]["communication_preference"]
          created_at?: string
          email?: string | null
          external_customer_id?: string | null
          failed_payments?: number
          id?: string
          last_successful_payment_at?: string | null
          lifetime_value?: number
          name?: string | null
          phone?: string | null
          successful_payments?: number
          updated_at?: string
        }
        Update: {
          communication_preference?: Database["public"]["Enums"]["communication_preference"]
          created_at?: string
          email?: string | null
          external_customer_id?: string | null
          failed_payments?: number
          id?: string
          last_successful_payment_at?: string | null
          lifetime_value?: number
          name?: string | null
          phone?: string | null
          successful_payments?: number
          updated_at?: string
        }
        Relationships: []
      }
      escalations: {
        Row: {
          amount: number
          case_id: string
          confidence: number | null
          created_at: string
          customer_snapshot: Json
          diagnosis: string | null
          failure: string | null
          id: string
          previous_actions: Json
          reason: string
          recommended_next_step: string | null
        }
        Insert: {
          amount: number
          case_id: string
          confidence?: number | null
          created_at?: string
          customer_snapshot?: Json
          diagnosis?: string | null
          failure?: string | null
          id?: string
          previous_actions?: Json
          reason: string
          recommended_next_step?: string | null
        }
        Update: {
          amount?: number
          case_id?: string
          confidence?: number | null
          created_at?: string
          customer_snapshot?: Json
          diagnosis?: string | null
          failure?: string | null
          id?: string
          previous_actions?: Json
          reason?: string
          recommended_next_step?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "escalations_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "recovery_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          amount: number
          created_at: string
          currency: string
          customer_id: string | null
          id: string
          razorpay_order_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          customer_id?: string | null
          id?: string
          razorpay_order_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          customer_id?: string | null
          id?: string
          razorpay_order_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          customer_id: string | null
          error_code: string | null
          error_description: string | null
          error_reason: string | null
          id: string
          method: string | null
          razorpay_order_id: string | null
          razorpay_payment_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          customer_id?: string | null
          error_code?: string | null
          error_description?: string | null
          error_reason?: string | null
          id?: string
          method?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          customer_id?: string | null
          error_code?: string | null
          error_description?: string | null
          error_reason?: string | null
          id?: string
          method?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_settings: {
        Row: {
          cooldown_hours: number
          high_value_threshold: number
          id: string
          low_confidence_threshold: number
          max_outreach_attempts: number
          max_retry_attempts: number
          minimum_recovery_value: number
          updated_at: string
        }
        Insert: {
          cooldown_hours?: number
          high_value_threshold?: number
          id?: string
          low_confidence_threshold?: number
          max_outreach_attempts?: number
          max_retry_attempts?: number
          minimum_recovery_value?: number
          updated_at?: string
        }
        Update: {
          cooldown_hours?: number
          high_value_threshold?: number
          id?: string
          low_confidence_threshold?: number
          max_outreach_attempts?: number
          max_retry_attempts?: number
          minimum_recovery_value?: number
          updated_at?: string
        }
        Relationships: []
      }
      recovery_actions: {
        Row: {
          action: Database["public"]["Enums"]["recovery_action_type"]
          case_id: string
          channel: string | null
          created_at: string
          error: string | null
          executed_at: string | null
          id: string
          provider_message_id: string | null
          result: Json | null
          scheduled_for: string | null
          status: Database["public"]["Enums"]["action_status"]
        }
        Insert: {
          action: Database["public"]["Enums"]["recovery_action_type"]
          case_id: string
          channel?: string | null
          created_at?: string
          error?: string | null
          executed_at?: string | null
          id?: string
          provider_message_id?: string | null
          result?: Json | null
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["action_status"]
        }
        Update: {
          action?: Database["public"]["Enums"]["recovery_action_type"]
          case_id?: string
          channel?: string | null
          created_at?: string
          error?: string | null
          executed_at?: string | null
          id?: string
          provider_message_id?: string | null
          result?: Json | null
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["action_status"]
        }
        Relationships: [
          {
            foreignKeyName: "recovery_actions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "recovery_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      recovery_cases: {
        Row: {
          approved_action:
            | Database["public"]["Enums"]["recovery_action_type"]
            | null
          channel: string | null
          created_at: string
          customer_id: string | null
          diagnosis: string | null
          diagnosis_confidence: number | null
          escalation_reason: string | null
          expected_recovery_value: number | null
          id: string
          llm_reason: string | null
          next_action_at: string | null
          order_id: string | null
          outreach_count: number
          payment_id: string
          payment_link_url: string | null
          policy_decision: string | null
          policy_reason: string | null
          recommended_action:
            | Database["public"]["Enums"]["recovery_action_type"]
            | null
          recoverability_probability: number | null
          recovered_amount: number | null
          recovery_score: number | null
          retry_count: number
          status: Database["public"]["Enums"]["case_status"]
          stop_reason: string | null
          updated_at: string
        }
        Insert: {
          approved_action?:
            | Database["public"]["Enums"]["recovery_action_type"]
            | null
          channel?: string | null
          created_at?: string
          customer_id?: string | null
          diagnosis?: string | null
          diagnosis_confidence?: number | null
          escalation_reason?: string | null
          expected_recovery_value?: number | null
          id?: string
          llm_reason?: string | null
          next_action_at?: string | null
          order_id?: string | null
          outreach_count?: number
          payment_id: string
          payment_link_url?: string | null
          policy_decision?: string | null
          policy_reason?: string | null
          recommended_action?:
            | Database["public"]["Enums"]["recovery_action_type"]
            | null
          recoverability_probability?: number | null
          recovered_amount?: number | null
          recovery_score?: number | null
          retry_count?: number
          status?: Database["public"]["Enums"]["case_status"]
          stop_reason?: string | null
          updated_at?: string
        }
        Update: {
          approved_action?:
            | Database["public"]["Enums"]["recovery_action_type"]
            | null
          channel?: string | null
          created_at?: string
          customer_id?: string | null
          diagnosis?: string | null
          diagnosis_confidence?: number | null
          escalation_reason?: string | null
          expected_recovery_value?: number | null
          id?: string
          llm_reason?: string | null
          next_action_at?: string | null
          order_id?: string | null
          outreach_count?: number
          payment_id?: string
          payment_link_url?: string | null
          policy_decision?: string | null
          policy_reason?: string | null
          recommended_action?:
            | Database["public"]["Enums"]["recovery_action_type"]
            | null
          recoverability_probability?: number | null
          recovered_amount?: number | null
          recovery_score?: number | null
          retry_count?: number
          status?: Database["public"]["Enums"]["case_status"]
          stop_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recovery_cases_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_cases_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_cases_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          payload_hash: string
          processed_at: string | null
          raw_payload: Json
          razorpay_event_id: string
          received_at: string
          status: Database["public"]["Enums"]["webhook_processing_status"]
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          payload_hash: string
          processed_at?: string | null
          raw_payload?: Json
          razorpay_event_id: string
          received_at?: string
          status?: Database["public"]["Enums"]["webhook_processing_status"]
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          payload_hash?: string
          processed_at?: string | null
          raw_payload?: Json
          razorpay_event_id?: string
          received_at?: string
          status?: Database["public"]["Enums"]["webhook_processing_status"]
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      action_status:
        | "PENDING"
        | "EXECUTING"
        | "SENT"
        | "SUCCESS"
        | "FAILED"
        | "CANCELLED"
      case_status:
        | "NEW"
        | "ANALYZING"
        | "ACTION_PLANNED"
        | "ACTION_EXECUTED"
        | "WAITING_FOR_OUTCOME"
        | "RETRY_PENDING"
        | "RECOVERED"
        | "ESCALATED"
        | "STOPPED"
      communication_preference: "WHATSAPP" | "EMAIL" | "BOTH" | "NONE"
      recovery_action_type:
        | "SEND_PAYMENT_LINK"
        | "REQUEST_PAYMENT_METHOD_UPDATE"
        | "SCHEDULE_RETRY"
        | "SEND_REMINDER"
        | "ESCALATE"
        | "WAIT"
        | "STOP"
      webhook_processing_status:
        | "RECEIVED"
        | "PROCESSED"
        | "FAILED"
        | "DUPLICATE"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      action_status: [
        "PENDING",
        "EXECUTING",
        "SENT",
        "SUCCESS",
        "FAILED",
        "CANCELLED",
      ],
      case_status: [
        "NEW",
        "ANALYZING",
        "ACTION_PLANNED",
        "ACTION_EXECUTED",
        "WAITING_FOR_OUTCOME",
        "RETRY_PENDING",
        "RECOVERED",
        "ESCALATED",
        "STOPPED",
      ],
      communication_preference: ["WHATSAPP", "EMAIL", "BOTH", "NONE"],
      recovery_action_type: [
        "SEND_PAYMENT_LINK",
        "REQUEST_PAYMENT_METHOD_UPDATE",
        "SCHEDULE_RETRY",
        "SEND_REMINDER",
        "ESCALATE",
        "WAIT",
        "STOP",
      ],
      webhook_processing_status: [
        "RECEIVED",
        "PROCESSED",
        "FAILED",
        "DUPLICATE",
      ],
    },
  },
} as const
