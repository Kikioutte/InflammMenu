import { type IconType } from "../app/types";

export function EmptyRoot({ icon: Icon, title, body }: { icon: IconType; title: string; body: string }) {
  return <main className="page-content empty-root"><Icon /><h1>{title}</h1><p>{body}</p></main>;
}
