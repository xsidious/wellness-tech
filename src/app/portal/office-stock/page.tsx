import { redirect } from "next/navigation";

export default function OfficeStock() {
  redirect("/portal/catalog?office=1");
}
