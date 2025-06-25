import { BaseLLMProvider } from './BaseLLMProvider';
import { OllamaLLMProvider } from './OllamaLLMProvider';
import { OpenAILLMProvider } from './OpenAILLMProvider';
import { LLMConfig, LLMProviderType } from '../../../types/llm';

export class LLMProviderFactory {
  static createProvider(providerType?: LLMProviderType): BaseLLMProvider {
    const config = BaseLLMProvider.getConfigFromSettings();
    const type = providerType || BaseLLMProvider.getProviderTypeFromSettings();

    return this.createProviderWithConfig(config, type);
  }

  static createProviderWithConfig(
    config: LLMConfig,
    providerType: LLMProviderType = "ollama"
  ): BaseLLMProvider {
    switch (providerType) {
      case "ollama":
        return new OllamaLLMProvider(config);
      case "openai":
        return new OpenAILLMProvider(config);
      default:
        throw new Error(`Unsupported LLM provider type: ${providerType}`);
    }
  }

  static getSupportedProviders(): LLMProviderType[] {
    return ["ollama", "openai"];
  }

  static validateProviderType(providerType: string): providerType is LLMProviderType {
    return this.getSupportedProviders().includes(providerType as LLMProviderType);
  }
}