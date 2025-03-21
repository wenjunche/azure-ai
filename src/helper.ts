import { getEncoding, getEncodingNameForModel, TiktokenModel } from 'js-tiktoken';

export const countTokens = (modelName: TiktokenModel, prompt: string): number | undefined => {
    const encName = getEncodingNameForModel(modelName);
    const encoder = getEncoding(encName);
    if (encoder) {
        const tokens = encoder.encode(prompt);
        return tokens.length;
    }
}