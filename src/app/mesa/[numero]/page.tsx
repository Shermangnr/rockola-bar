export default async function VistaMesa({
  params,
}: {
  params: Promise<{ numero: string }>;
}) {
  const { numero } = await params;
  return <h1>Vista de Cliente — Mesa #{numero}</h1>;
}
