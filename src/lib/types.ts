export interface Submission {
  id: string;
  created_at: string;
  practice_name: string;
  practice_type: string | null;
  locations: string | null;
  pms: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  slug: string;
  status: "pending" | "complete";
  notes: string | null;
  dba_name: string | null;
  office_phone: string | null;
  office_email: string | null;
  website: string | null;
  contact_role: string | null;
  form_data: Record<string, unknown> | null;
}

export interface Database {
  public: {
    Tables: {
      submissions: {
        Row: Submission;
        Insert: Omit<Submission, "id" | "created_at">;
        Update: Partial<Omit<Submission, "id" | "created_at">>;
      };
    };
  };
}
