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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      anchor_readings: {
        Row: {
          anchor_id: string
          cycle_id: string | null
          id: string
          read_at: string
          team_id: string
          value: number | null
          verdict: string | null
        }
        Insert: {
          anchor_id: string
          cycle_id?: string | null
          id?: string
          read_at?: string
          team_id: string
          value?: number | null
          verdict?: string | null
        }
        Update: {
          anchor_id?: string
          cycle_id?: string | null
          id?: string
          read_at?: string
          team_id?: string
          value?: number | null
          verdict?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anchor_readings_anchor_id_fkey"
            columns: ["anchor_id"]
            isOneToOne: false
            referencedRelation: "anchors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anchor_readings_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "assessment_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anchor_readings_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "v_axis_scores"
            referencedColumns: ["cycle_id"]
          },
          {
            foreignKeyName: "anchor_readings_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "v_cycle_scores"
            referencedColumns: ["cycle_id"]
          },
          {
            foreignKeyName: "anchor_readings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      anchors: {
        Row: {
          active: boolean
          comparator: string
          dimension_id: string
          id: string
          metric_key: string
          name: string
          stage_targets: Json
          unit: string | null
        }
        Insert: {
          active?: boolean
          comparator: string
          dimension_id: string
          id?: string
          metric_key: string
          name: string
          stage_targets?: Json
          unit?: string | null
        }
        Update: {
          active?: boolean
          comparator?: string
          dimension_id?: string
          id?: string
          metric_key?: string
          name?: string
          stage_targets?: Json
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anchors_dimension_id_fkey"
            columns: ["dimension_id"]
            isOneToOne: false
            referencedRelation: "dimensions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anchors_dimension_id_fkey"
            columns: ["dimension_id"]
            isOneToOne: false
            referencedRelation: "v_cycle_scores"
            referencedColumns: ["dimension_id"]
          },
        ]
      }
      assessment_answers: {
        Row: {
          answer_value: number
          assessment_id: string
          created_at: string
          id: string
          question_id: string
        }
        Insert: {
          answer_value: number
          assessment_id: string
          created_at?: string
          id?: string
          question_id: string
        }
        Update: {
          answer_value?: number
          assessment_id?: string
          created_at?: string
          id?: string
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_answers_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_cycles: {
        Row: {
          created_at: string
          homologated_by: string | null
          id: string
          migrated_scale: boolean
          officialized_at: string | null
          previous_cycle_id: string | null
          quarter: string
          status: string
          team_id: string
          workshop_at: string | null
        }
        Insert: {
          created_at?: string
          homologated_by?: string | null
          id?: string
          migrated_scale?: boolean
          officialized_at?: string | null
          previous_cycle_id?: string | null
          quarter: string
          status?: string
          team_id: string
          workshop_at?: string | null
        }
        Update: {
          created_at?: string
          homologated_by?: string | null
          id?: string
          migrated_scale?: boolean
          officialized_at?: string | null
          previous_cycle_id?: string | null
          quarter?: string
          status?: string
          team_id?: string
          workshop_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assessment_cycles_homologated_by_fkey"
            columns: ["homologated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_cycles_previous_cycle_id_fkey"
            columns: ["previous_cycle_id"]
            isOneToOne: false
            referencedRelation: "assessment_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_cycles_previous_cycle_id_fkey"
            columns: ["previous_cycle_id"]
            isOneToOne: false
            referencedRelation: "v_axis_scores"
            referencedColumns: ["cycle_id"]
          },
          {
            foreignKeyName: "assessment_cycles_previous_cycle_id_fkey"
            columns: ["previous_cycle_id"]
            isOneToOne: false
            referencedRelation: "v_cycle_scores"
            referencedColumns: ["cycle_id"]
          },
          {
            foreignKeyName: "assessment_cycles_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_theme_scores: {
        Row: {
          assessment_id: string
          created_at: string
          deadline: string | null
          evolution_plan: string | null
          id: string
          inferred_level: number
          kanban_order: number | null
          kanban_status: string | null
          recommended_next_step: string | null
          score: number
          theme_id: string
        }
        Insert: {
          assessment_id: string
          created_at?: string
          deadline?: string | null
          evolution_plan?: string | null
          id?: string
          inferred_level: number
          kanban_order?: number | null
          kanban_status?: string | null
          recommended_next_step?: string | null
          score: number
          theme_id: string
        }
        Update: {
          assessment_id?: string
          created_at?: string
          deadline?: string | null
          evolution_plan?: string | null
          id?: string
          inferred_level?: number
          kanban_order?: number | null
          kanban_status?: string | null
          recommended_next_step?: string | null
          score?: number
          theme_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_theme_scores_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_theme_scores_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "themes"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          comments: string | null
          created_at: string
          created_by: string | null
          id: string
          is_official: boolean | null
          overall_level: number | null
          perspective: string | null
          team_id: string
        }
        Insert: {
          comments?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_official?: boolean | null
          overall_level?: number | null
          perspective?: string | null
          team_id: string
        }
        Update: {
          comments?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_official?: boolean | null
          overall_level?: number | null
          perspective?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      axes: {
        Row: {
          display_order: number
          id: string
          key: string
          name: string
          owner_role: string
        }
        Insert: {
          display_order: number
          id?: string
          key: string
          name: string
          owner_role: string
        }
        Update: {
          display_order?: number
          id?: string
          key?: string
          name?: string
          owner_role?: string
        }
        Relationships: []
      }
      custom_kaizens: {
        Row: {
          assessment_id: string | null
          completed_at: string | null
          created_at: string | null
          deadline: string | null
          description: string | null
          display_order: number | null
          id: string
          status: string | null
          team_id: string
          title: string
        }
        Insert: {
          assessment_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          deadline?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          status?: string | null
          team_id: string
          title: string
        }
        Update: {
          assessment_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          deadline?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          status?: string | null
          team_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_kaizens_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_kaizens_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      dimension_stage_descriptions: {
        Row: {
          anchor_note: string | null
          description: string
          dimension_id: string
          example: string | null
          id: string
          kaizen_hint: string | null
          short_text: string
          stage_number: number
        }
        Insert: {
          anchor_note?: string | null
          description: string
          dimension_id: string
          example?: string | null
          id?: string
          kaizen_hint?: string | null
          short_text: string
          stage_number: number
        }
        Update: {
          anchor_note?: string | null
          description?: string
          dimension_id?: string
          example?: string | null
          id?: string
          kaizen_hint?: string | null
          short_text?: string
          stage_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "dimension_stage_descriptions_dimension_id_fkey"
            columns: ["dimension_id"]
            isOneToOne: false
            referencedRelation: "dimensions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dimension_stage_descriptions_dimension_id_fkey"
            columns: ["dimension_id"]
            isOneToOne: false
            referencedRelation: "v_cycle_scores"
            referencedColumns: ["dimension_id"]
          },
          {
            foreignKeyName: "dimension_stage_descriptions_stage_number_fkey"
            columns: ["stage_number"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["number"]
          },
        ]
      }
      dimensions: {
        Row: {
          axis_id: string
          description: string
          display_order: number
          id: string
          key: string
          name: string
          narrative: string | null
          owner_roles: string[]
        }
        Insert: {
          axis_id: string
          description: string
          display_order: number
          id?: string
          key: string
          name: string
          narrative?: string | null
          owner_roles?: string[]
        }
        Update: {
          axis_id?: string
          description?: string
          display_order?: number
          id?: string
          key?: string
          name?: string
          narrative?: string | null
          owner_roles?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "dimensions_axis_id_fkey"
            columns: ["axis_id"]
            isOneToOne: false
            referencedRelation: "axes"
            referencedColumns: ["id"]
          },
        ]
      }
      homologations: {
        Row: {
          adjusted: boolean
          am_user_id: string
          anchors_snapshot: Json | null
          created_at: string
          cycle_id: string
          dimension_id: string
          justification: string | null
          official_stage: number
        }
        Insert: {
          adjusted?: boolean
          am_user_id: string
          anchors_snapshot?: Json | null
          created_at?: string
          cycle_id: string
          dimension_id: string
          justification?: string | null
          official_stage: number
        }
        Update: {
          adjusted?: boolean
          am_user_id?: string
          anchors_snapshot?: Json | null
          created_at?: string
          cycle_id?: string
          dimension_id?: string
          justification?: string | null
          official_stage?: number
        }
        Relationships: [
          {
            foreignKeyName: "homologations_am_user_id_fkey"
            columns: ["am_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homologations_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "assessment_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homologations_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "v_axis_scores"
            referencedColumns: ["cycle_id"]
          },
          {
            foreignKeyName: "homologations_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "v_cycle_scores"
            referencedColumns: ["cycle_id"]
          },
          {
            foreignKeyName: "homologations_dimension_id_fkey"
            columns: ["dimension_id"]
            isOneToOne: false
            referencedRelation: "dimensions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homologations_dimension_id_fkey"
            columns: ["dimension_id"]
            isOneToOne: false
            referencedRelation: "v_cycle_scores"
            referencedColumns: ["dimension_id"]
          },
        ]
      }
      kaizens: {
        Row: {
          anchor_id: string | null
          baseline_value: number | null
          created_at: string
          cycle_id: string | null
          dimension_id: string | null
          due_date: string | null
          from_stage: number | null
          id: string
          owner_id: string | null
          result_value: number | null
          source: string
          status: string
          target_value: number | null
          team_id: string
          title: string
          to_stage: number | null
        }
        Insert: {
          anchor_id?: string | null
          baseline_value?: number | null
          created_at?: string
          cycle_id?: string | null
          dimension_id?: string | null
          due_date?: string | null
          from_stage?: number | null
          id?: string
          owner_id?: string | null
          result_value?: number | null
          source?: string
          status?: string
          target_value?: number | null
          team_id: string
          title: string
          to_stage?: number | null
        }
        Update: {
          anchor_id?: string | null
          baseline_value?: number | null
          created_at?: string
          cycle_id?: string | null
          dimension_id?: string | null
          due_date?: string | null
          from_stage?: number | null
          id?: string
          owner_id?: string | null
          result_value?: number | null
          source?: string
          status?: string
          target_value?: number | null
          team_id?: string
          title?: string
          to_stage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kaizens_anchor_id_fkey"
            columns: ["anchor_id"]
            isOneToOne: false
            referencedRelation: "anchors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kaizens_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "assessment_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kaizens_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "v_axis_scores"
            referencedColumns: ["cycle_id"]
          },
          {
            foreignKeyName: "kaizens_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "v_cycle_scores"
            referencedColumns: ["cycle_id"]
          },
          {
            foreignKeyName: "kaizens_dimension_id_fkey"
            columns: ["dimension_id"]
            isOneToOne: false
            referencedRelation: "dimensions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kaizens_dimension_id_fkey"
            columns: ["dimension_id"]
            isOneToOne: false
            referencedRelation: "v_cycle_scores"
            referencedColumns: ["dimension_id"]
          },
          {
            foreignKeyName: "kaizens_from_stage_fkey"
            columns: ["from_stage"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["number"]
          },
          {
            foreignKeyName: "kaizens_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kaizens_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kaizens_to_stage_fkey"
            columns: ["to_stage"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["number"]
          },
        ]
      }
      levels: {
        Row: {
          created_at: string
          id: string
          name: string
          number: number
          short_description: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          number: number
          short_description?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          number?: number
          short_description?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          approved: boolean
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          approved?: boolean
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          approved?: boolean
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      proposals: {
        Row: {
          cycle_id: string
          decided_by: string
          dimension_id: string
          divergence: boolean
          notes: string | null
          stage: number
        }
        Insert: {
          cycle_id: string
          decided_by: string
          dimension_id: string
          divergence?: boolean
          notes?: string | null
          stage: number
        }
        Update: {
          cycle_id?: string
          decided_by?: string
          dimension_id?: string
          divergence?: boolean
          notes?: string | null
          stage?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposals_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "assessment_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "v_axis_scores"
            referencedColumns: ["cycle_id"]
          },
          {
            foreignKeyName: "proposals_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "v_cycle_scores"
            referencedColumns: ["cycle_id"]
          },
          {
            foreignKeyName: "proposals_dimension_id_fkey"
            columns: ["dimension_id"]
            isOneToOne: false
            referencedRelation: "dimensions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_dimension_id_fkey"
            columns: ["dimension_id"]
            isOneToOne: false
            referencedRelation: "v_cycle_scores"
            referencedColumns: ["dimension_id"]
          },
        ]
      }
      questions: {
        Row: {
          active: boolean
          created_at: string
          display_order: number
          id: string
          level_hint_from: number
          level_hint_to: number
          text: string
          theme_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_order?: number
          id?: string
          level_hint_from?: number
          level_hint_to?: number
          text: string
          theme_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_order?: number
          id?: string
          level_hint_from?: number
          level_hint_to?: number
          text?: string
          theme_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "themes"
            referencedColumns: ["id"]
          },
        ]
      }
      squad_members: {
        Row: {
          role: string
          team_id: string
          user_id: string
        }
        Insert: {
          role: string
          team_id: string
          user_id: string
        }
        Update: {
          role?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "squad_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "squad_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stages: {
        Row: {
          description: string
          legacy_name: string
          name: string
          number: number
          tuckman: string
        }
        Insert: {
          description: string
          legacy_name: string
          name: string
          number: number
          tuckman: string
        }
        Update: {
          description?: string
          legacy_name?: string
          name?: string
          number?: number
          tuckman?: string
        }
        Relationships: []
      }
      teams: {
        Row: {
          created_at: string
          description: string | null
          id: string
          locavia_team_key: string | null
          name: string
          owner_id: string | null
          status: string | null
          tower: string | null
          tribe: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          locavia_team_key?: string | null
          name: string
          owner_id?: string | null
          status?: string | null
          tower?: string | null
          tribe?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          locavia_team_key?: string | null
          name?: string
          owner_id?: string | null
          status?: string | null
          tower?: string | null
          tribe?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      theme_level_descriptions: {
        Row: {
          anti_patterns: string | null
          created_at: string
          description: string
          examples: string | null
          id: string
          level_number: number
          next_step: string | null
          theme_id: string
        }
        Insert: {
          anti_patterns?: string | null
          created_at?: string
          description: string
          examples?: string | null
          id?: string
          level_number: number
          next_step?: string | null
          theme_id: string
        }
        Update: {
          anti_patterns?: string | null
          created_at?: string
          description?: string
          examples?: string | null
          id?: string
          level_number?: number
          next_step?: string | null
          theme_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "theme_level_descriptions_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "themes"
            referencedColumns: ["id"]
          },
        ]
      }
      themes: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          display_order: number
          id: string
          name: string
          narrative: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          name: string
          narrative?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          name?: string
          narrative?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      votes: {
        Row: {
          created_at: string
          cycle_id: string
          dimension_id: string
          id: string
          role_at_vote: string
          stage: number
          user_id: string
        }
        Insert: {
          created_at?: string
          cycle_id: string
          dimension_id: string
          id?: string
          role_at_vote: string
          stage: number
          user_id: string
        }
        Update: {
          created_at?: string
          cycle_id?: string
          dimension_id?: string
          id?: string
          role_at_vote?: string
          stage?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "votes_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "assessment_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "v_axis_scores"
            referencedColumns: ["cycle_id"]
          },
          {
            foreignKeyName: "votes_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "v_cycle_scores"
            referencedColumns: ["cycle_id"]
          },
          {
            foreignKeyName: "votes_dimension_id_fkey"
            columns: ["dimension_id"]
            isOneToOne: false
            referencedRelation: "dimensions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_dimension_id_fkey"
            columns: ["dimension_id"]
            isOneToOne: false
            referencedRelation: "v_cycle_scores"
            referencedColumns: ["dimension_id"]
          },
          {
            foreignKeyName: "votes_stage_fkey"
            columns: ["stage"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["number"]
          },
          {
            foreignKeyName: "votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_axis_scores: {
        Row: {
          axis_key: string | null
          axis_score: number | null
          cycle_id: string | null
          quarter: string | null
          team_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assessment_cycles_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      v_cycle_scores: {
        Row: {
          axis_key: string | null
          cycle_id: string | null
          dim_key: string | null
          dim_name: string | null
          dimension_id: string | null
          migrated_scale: boolean | null
          official_stage: number | null
          quarter: string | null
          team_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assessment_cycles_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      v_quarter_comparison: {
        Row: {
          axis_key: string | null
          dim_key: string | null
          dim_name: string | null
          migrated_scale: boolean | null
          official_stage: number | null
          prev_stage: number | null
          quarter: string | null
          team_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assessment_cycles_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      can_access_assessment: {
        Args: { _assessment_id: string }
        Returns: boolean
      }
      can_access_team: { Args: { _team_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      find_profile_by_email: {
        Args: { p_email: string }
        Returns: { id: string; email: string | null; full_name: string | null }[]
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_am: { Args: { t: string }; Returns: boolean }
      is_any_am: { Args: never; Returns: boolean }
      is_approved: { Args: { _user_id: string }; Returns: boolean }
      is_member: { Args: { t: string }; Returns: boolean }
      is_portal_admin: { Args: never; Returns: boolean }
      is_sm: { Args: { t: string }; Returns: boolean }
      officialize_cycle: { Args: { p_cycle: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "user"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
