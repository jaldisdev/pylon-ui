//
// This source file is part of the Pylon open source project.
//
// Copyright (c) 2026 Jaldis B.V.
//
// Licensed under the MIT OR Apache-2.0 license (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://opensource.org/licenses/MIT
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//

// Squarified treemap layout algorithm — ported verbatim (only renamed for
// lint/style, no logic changes) from gel-ui's
// shared/studio/components/explainVis/treemapLayout.tsx `computeLayout` +
// its palettes, since the Query Editor's AnalyzeView treemap is a faithful
// port of that component. The goal of the algorithm is to maximize the
// aspect ratio of each child item, while still respecting the relative
// sizes specified by each item's `area` (a 0..1 fraction of the parent).

export const lightPalette = ["#D5D8EF", "#FDF5E2", "#DAE9FB", "#E6FFF8"];
export const darkPalette = ["#292235", "#2B3428", "#182A30", "#20352F"];

export interface LayoutPos {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface LayoutItem<T> extends LayoutPos {
  item: T;
}

export interface ChildItem<T> {
  item: T;
  area: number;
}

export function computeLayout<T>(parentRatio: number, childAreas: ChildItem<T>[]): LayoutItem<T>[] {
  let vert = parentRatio < 1;
  let remainingRatio = vert ? 1 / parentRatio : parentRatio;

  const layout: LayoutItem<T>[] = [];
  const lt = [0, 1];

  let groupArea = 1;
  let groupTotal = 0;
  let groupChildren: ChildItem<T>[] = [];
  let lastRatio = Infinity;

  const addItemsToLayout = () => {
    let t = 0;
    const h = vert ? lt[1] * groupTotal : lt[1];
    const w = vert ? 1 - lt[0] : (1 - lt[0]) * groupTotal;
    for (const c of groupChildren) {
      const cf = (c.area / groupTotal) * (vert ? w : h);
      layout.push({
        item: c.item,
        top: lt[1] - h + (vert ? 0 : t),
        left: lt[0] + (vert ? t : 0),
        width: vert ? cf : w,
        height: vert ? h : cf,
      });
      t += cf;
    }
    if (vert) {
      lt[1] -= h;
    } else {
      lt[0] += w;
    }
  };

  for (let i = 0; i < childAreas.length; i++) {
    const child = childAreas[i];
    const childGroupArea = child.area / groupArea;
    groupTotal += childGroupArea;
    groupChildren.push({...child, area: childGroupArea});
    const groupWidth = groupTotal * remainingRatio;
    const worstRatio = Math.max(
      ...groupChildren.map((c) => {
        const r = c.area / groupTotal;
        return r < groupWidth ? groupWidth / r : r / groupWidth;
      })
    );
    if (worstRatio > lastRatio) {
      groupTotal -= groupChildren.pop()!.area;

      addItemsToLayout();

      remainingRatio = remainingRatio * (1 - groupTotal);
      if (remainingRatio < 1) {
        vert = !vert;
        remainingRatio = 1 / remainingRatio;
      }

      groupArea = groupArea * (1 - groupTotal);

      const childGroupArea = child.area / groupArea;
      groupTotal = childGroupArea;
      groupChildren = [{...child, area: childGroupArea}];
      const groupWidth = groupTotal * remainingRatio;
      lastRatio = groupWidth >= 1 ? groupWidth : 1 / groupWidth;
    } else {
      lastRatio = worstRatio;
    }
  }

  if (groupChildren.length) {
    addItemsToLayout();
  }

  return layout;
}
