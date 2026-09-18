export type AssetQuote = {
  asset: string;
  price: string;
  timestamp: string;
  source: string;
  delayed: boolean;
};

export interface MarketDataProvider {
  getQuotes(assets: string[]): Promise<AssetQuote[]>;
}
