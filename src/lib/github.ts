// GitHub REST API functions

const GITHUB_API = "https://api.github.com";

// Types
export type Repo = {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  private: boolean;
  description: string | null;
  updated_at: string;
};

export type Commit = {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      date: string;
    };
  };
  files?: {
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    patch?: string;
  }[];
};

// Headers for all GitHub API requests
function getHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github.v3+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

// Get all repos the user has access to
export async function fetchUserRepos(accessToken: string): Promise<Repo[]> {
  const response = await fetch(
    `${GITHUB_API}/user/repos?sort=updated&per_page=100`,
    { headers: getHeaders(accessToken) }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch repos: ${response.statusText}`);
  }

  return response.json();
}

// Internal: get single commit with diff
async function fetchCommitWithDiff(
  accessToken: string,
  owner: string,
  repo: string,
  sha: string
): Promise<Commit> {
  const response = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/commits/${sha}`,
    { headers: getHeaders(accessToken) }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch commit: ${response.statusText}`);
  }

  return response.json();
}

// Get commits with their diffs for changelog generation
export async function fetchCommitsWithDiffs(
  accessToken: string,
  owner: string,
  repo: string,
  since?: string,
  until?: string
): Promise<Commit[]> {
  // Step 1: Get list of commits
  const params = new URLSearchParams({ per_page: "100" });
  if (since) {
    params.set("since", since);
  }
  if (until) {
    params.set("until", until);
  }

  const listResponse = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/commits?${params}`,
    { headers: getHeaders(accessToken) }
  );

  if (!listResponse.ok) {
    throw new Error(`Failed to fetch commits: ${listResponse.statusText}`);
  }

  const commits: Commit[] = await listResponse.json();

  // Step 2: Fetch diffs for each commit (limit to 50 to avoid rate limits)
  const commitsWithDiffs = await Promise.all(
    commits.slice(0, 50).map((commit) =>
      fetchCommitWithDiff(accessToken, owner, repo, commit.sha)
    )
  );

  return commitsWithDiffs;
}
