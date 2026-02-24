import console from 'node:console';
export interface GreetOptions {
  name?: string;
  upperCase?: boolean;
}

export function greet(options: GreetOptions = {}) {
  const { name = 'World', upperCase = false } = options;
  let message = `Hello, ${name}!`;

  if (upperCase) {
    message = message.toUpperCase();
  }

  console.log(message);
  return message;
}
