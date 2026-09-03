import { MinPriorityQueue } from "./priorityQueue.js";

export function dijkstra(graph, start, end) {
  const distance = {};
  const previous = {};
  const visited = new Set();

  const pq = new MinPriorityQueue();

  for (const node in graph) {
    distance[node] = Infinity;
    previous[node] = null;
  }

  distance[start] = 0;
  pq.enqueue(start, 0);

  while (!pq.isEmpty()) {
    const { node: currentNode } = pq.dequeue();

    // Stale queue entry (a shorter path to this node was already processed) — skip.
    if (visited.has(currentNode)) continue;
    visited.add(currentNode);

    if (currentNode === end) break;

    const neighbours = graph[currentNode] || [];
    for (const neighbour of neighbours) {
      const nextNode = neighbour.node;
      const weight = neighbour.weight;

      if (visited.has(nextNode)) continue;

      const newDistance = distance[currentNode] + weight;

      if (newDistance < distance[nextNode]) {
        distance[nextNode] = newDistance;
        previous[nextNode] = currentNode;
        pq.enqueue(nextNode, newDistance);
      }
    }
  }

  // Reconstruct path
  const path = [];
  let current = end;
  while (current !== null && current !== undefined) {
    path.unshift(current);
    current = previous[current];
  }

  // If the end node was never reached, previous chain won't lead back to start —
  // guard against returning a bogus single-node "path".
  if (distance[end] === Infinity) {
    return { path: [], distance: Infinity };
  }

  return {
    path,
    distance: distance[end],
  };
}
