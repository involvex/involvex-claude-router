import console from "node:console";
export interface GreetOptions {
  name?: string;
  upperCase?: boolean;
}

export function greet(args: string[] = []) {
  // Simple argument parsing for greet command
  const name = args[0] ?? "World";
  const upperCase = args.includes("--upper");

  let message = `Hello, ${name}!`;
  if (upperCase) message = message.toUpperCase();

  console.log(message);
  return message;
}
