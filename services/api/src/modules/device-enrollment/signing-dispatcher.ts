export interface SigningDispatchRequest {
  id: string;
  mode: 'RESIGN' | 'FULL_REBUILD';
  enrollmentId: string;
}

export interface SigningInlineResult {
  ipaSha256: string;
  profileIdentifier: string;
  appVersion: string;
  buildNumber: string;
  sourceCommit: string;
  airliftSha: string;
  artifactRelativePath?: string;
}

export interface SigningDispatchResult {
  accepted: boolean;
  completedInline?: SigningInlineResult;
}

export interface SigningDispatcher {
  dispatch(job: SigningDispatchRequest): Promise<SigningDispatchResult>;
}

export class UnavailableSigningDispatcher implements SigningDispatcher {
  async dispatch(): Promise<SigningDispatchResult> {
    return { accepted: false };
  }
}

export class GitHubActionsSigningDispatcher implements SigningDispatcher {
  constructor(
    private readonly opts: {
      token: string;
      repository: string;
      workflow: string;
      ref: string;
      fetchImpl?: typeof fetch;
    },
  ) {}

  async dispatch(job: SigningDispatchRequest): Promise<SigningDispatchResult> {
    const [owner, repo] = this.opts.repository.split('/');
    if (!owner || !repo || !this.opts.token) return { accepted: false };
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${this.opts.workflow}/dispatches`;
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.opts.token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        ref: this.opts.ref || 'main',
        inputs: {
          job_id: job.id,
          mode: job.mode,
          enrollment_id: job.enrollmentId,
        },
      }),
    });
    return { accepted: res.ok };
  }
}
