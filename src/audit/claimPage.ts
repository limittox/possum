export interface ClaimObservation {
  url: string;
  title: string;
  headings: string[];
  links: Array<{ text: string; href: string }>;
  buttons: string[];
  bodyText: string;
}

export interface ClaimPage {
  observe(): Promise<ClaimObservation>;
  clickText(text: string): Promise<void>;
}

export class FakeClaimPage implements ClaimPage {
  private currentPath: string;

  constructor(private readonly nodes: Record<string, ClaimObservation>, startPath = "/") {
    this.currentPath = startPath;
  }

  async observe(): Promise<ClaimObservation> {
    const node = this.nodes[this.currentPath];
    if (!node) {
      throw new Error(`FakeClaimPage: no node for ${this.currentPath}`);
    }
    return node;
  }

  async clickText(text: string): Promise<void> {
    const node = this.nodes[this.currentPath];
    const link = node?.links.find((candidate) => candidate.text === text);
    if (link && this.nodes[link.href]) {
      this.currentPath = link.href;
    }
  }
}
