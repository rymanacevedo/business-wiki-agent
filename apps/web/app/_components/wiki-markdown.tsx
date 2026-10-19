"use client";

import type { ComponentProps } from "react";
import { MessageResponse } from "@/components/ai-elements/message";

type AnchorProps = ComponentProps<"a"> & { readonly node?: unknown };

/**
 * Markdown links as plain anchors: `/wiki/` links (Pages and Citations) open
 * the wiki browser, in a new tab from the chat; anything else opens in a new
 * tab with no referrer.
 */
function anchor(wikiTarget: "_self" | "_blank") {
  return function WikiAnchor({
    href,
    children,
    node: _node,
    ...props
  }: AnchorProps) {
    const isWiki = href?.startsWith("/wiki/") ?? false;
    return (
      <a
        {...props}
        className="font-medium text-primary underline underline-offset-2"
        href={href}
        rel={isWiki ? undefined : "noreferrer nofollow"}
        target={isWiki ? wikiTarget : "_blank"}
      >
        {children}
      </a>
    );
  };
}

/** Components for chat bubbles: Citations open the wiki in a new tab. */
export const chatLinkComponents = { a: anchor("_blank") };

const wikiLinkComponents = { a: anchor("_self") };

/** A Page body (links already pointed at /wiki/) rendered as Markdown. */
export function WikiMarkdown({ markdown }: { readonly markdown: string }) {
  return (
    <MessageResponse
      components={wikiLinkComponents}
      linkSafety={{ enabled: false }}
      mode="static"
    >
      {markdown}
    </MessageResponse>
  );
}
