// Types for our database tables

export type User = {
  id: string;
  github_id: number;
  email: string;
  name: string;
  avatar_url: string | null;
  access_token: string;
  created_at: string;
};

export type Repo = {
  id: string;
  user_id: string;
  owner: string;
  name: string;
  last_changelog_commit_sha: string | null;
  created_at: string;
};

export type ChangelogEntry = {
  id: string;
  repo_id: string;
  date: string;
  content: string;
  published: boolean;
  created_at: string;
  updated_at: string;
};
