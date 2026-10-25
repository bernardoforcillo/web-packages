import { createRootRoute, createRoute, Outlet, useRouter } from "@tanstack/react-router";

function build(withBoom: boolean) {
const root = createRootRoute({
  component: () => (
    <>
      <nav>
        <a href="/">Home</a> <a href="/about">About NAVLINK</a>
      </nav>
      <Outlet />
      <footer>FOOTER-TEXT</footer>
    </>
  ),
});

const index = createRoute({
  getParentRoute: () => root,
  path: "/",
  head: () => ({ meta: [{ title: "Home Title" }], links: [], scripts: [] }),
  component: () => (
    <main>
      <h1>Welcome</h1>
      <p>Fish &amp; chips &mdash; caf&eacute;</p>
    </main>
  ),
});

const docs = createRoute({
  getParentRoute: () => root,
  path: "/docs/guide",
  component: () => (
    <main>
      <h1>Guide</h1>
      <h2>Section</h2>
      <ul>
        <li>
          one
          <ul>
            <li>nested</li>
          </ul>
        </li>
        <li>two</li>
      </ul>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>a</td>
            <td>1</td>
          </tr>
        </tbody>
      </table>
      <pre>
        <code>{"if (a < b && c) { x(); }"}</code>
      </pre>
      <p>
        <a href="/x">abs</a> <a href="../y">rel</a> <a href="#frag">frag</a>
      </p>
      <img src="/img/a.png" alt="pic" />
      <script>{"window.SCRIPT_TEXT = 1"}</script>
    </main>
  ),
});

const boom = createRoute({
  getParentRoute: () => root,
  path: "/boom",
  component: () => {
    throw new Error("render exploded");
  },
});

const withLoader = createRoute({
  getParentRoute: () => root,
  path: "/with-loader",
  loader: () => ({ n: 1 }),
  component: () => <main>LOADER-PAGE</main>,
});

const param = createRoute({
  getParentRoute: () => root,
  path: "/posts/$postId",
  component: () => <main>PARAM-PAGE</main>,
});

function Ctx() {
  const router = useRouter();
  const env = (router.options.context as { env?: string } | undefined)?.env ?? "default";
  return <main>Env: {env}</main>;
}
const ctx = createRoute({ getParentRoute: () => root, path: "/ctx", component: Ctx });

return root.addChildren(withBoom ? [index, docs, boom, withLoader, param, ctx] : [index, docs, withLoader, param, ctx]);
}

/** Separate trees: addChildren mutates the root, so each one has its own. */
export const okTree = build(false);
export const tree = build(true);
