"use client";

import {
  CirclePlus,
  GitBranch,
  Trash2,
} from "lucide-react";


export interface FiveWhyNode {
  id: number;
  parent_id:
    | number
    | null;
  depth: number;
  answer: string;
  status:
    | "ACTIVE"
    | "DISCARDED";
}

function TreeNode({
  node,
  nodes,
  onAddChild,
  onDiscard,
  onRootCause,
}: {
  node: FiveWhyNode;
  nodes: FiveWhyNode[];
  onAddChild: (
    id: number,
  ) => void;
  onDiscard: (
    id: number,
  ) => void;
  onRootCause: (
    node: FiveWhyNode,
  ) => void;
}) {
  const children =
    nodes.filter(
      (
        item,
      ) =>
        item.parent_id ===
        node.id,
    );

  return (
    <div className="relative pl-5 before:absolute before:bottom-0 before:left-1 before:top-0 before:w-px before:bg-[#DEE0E2]">
      <div className={`relative rounded-[15px] border p-4 before:absolute before:-left-4 before:top-6 before:h-px before:w-4 before:bg-[#DEE0E2] ${node.status === "DISCARDED" ? "border-[#E6E7E8] bg-[#F6F6F5] opacity-60" : "border-[#DFE1E3] bg-white"}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#E41E2B]">
              Por quê {node.depth}
            </p>
            <p className="mt-2 text-[12px] leading-5 text-[#41464B]">
              {node.answer}
            </p>
          </div>

          <span className="rounded-full bg-[#F2F2F0] px-2 py-1 text-[8px] font-semibold text-[#7B8086]">
            {node.status ===
              "ACTIVE"
              ? "Ativo"
              : "Descartado"}
          </span>
        </div>

        {node.status ===
          "ACTIVE" && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-[#ECEDEF] pt-3">
            <button
              type="button"
              onClick={() =>
                onAddChild(
                  node.id,
                )
              }
              className="inline-flex items-center gap-1.5 text-[9px] font-semibold text-[#5F646A] hover:text-[#C92834]"
            >
              <CirclePlus
                size={12}
              />
              Gerar filho
            </button>
            <button
              type="button"
              onClick={() =>
                onRootCause(
                  node,
                )
              }
              className="inline-flex items-center gap-1.5 text-[9px] font-semibold text-[#5F646A] hover:text-[#C92834]"
            >
              <GitBranch
                size={12}
              />
              Propor causa
            </button>
            <button
              type="button"
              onClick={() =>
                onDiscard(
                  node.id,
                )
              }
              className="inline-flex items-center gap-1.5 text-[9px] font-semibold text-[#8A8F95] hover:text-[#C92834]"
            >
              <Trash2
                size={12}
              />
              Descartar
            </button>
          </div>
        )}
      </div>

      {children.length >
        0 && (
        <div className="mt-3 space-y-3">
          {children.map(
            (
              child,
            ) => (
              <TreeNode
                key={
                  child.id
                }
                node={
                  child
                }
                nodes={
                  nodes
                }
                onAddChild={
                  onAddChild
                }
                onDiscard={
                  onDiscard
                }
                onRootCause={
                  onRootCause
                }
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

export function FiveWhysTree({
  nodes,
  onAddChild,
  onDiscard,
  onRootCause,
}: {
  nodes: FiveWhyNode[];
  onAddChild: (
    id: number,
  ) => void;
  onDiscard: (
    id: number,
  ) => void;
  onRootCause: (
    node: FiveWhyNode,
  ) => void;
}) {
  const roots =
    nodes.filter(
      (
        node,
      ) =>
        node.parent_id ===
        null,
    );

  if (
    roots.length ===
    0
  ) {
    return (
      <div className="rounded-[16px] border border-dashed border-[#DADDE0] px-5 py-12 text-center text-[11px] text-[#969BA1]">
        Crie o primeiro porquê para iniciar a cadeia causal.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {roots.map(
        (
          root,
        ) => (
          <TreeNode
            key={
              root.id
            }
            node={
              root
            }
            nodes={
              nodes
            }
            onAddChild={
              onAddChild
            }
            onDiscard={
              onDiscard
            }
            onRootCause={
              onRootCause
            }
          />
        ),
      )}
    </div>
  );
}
