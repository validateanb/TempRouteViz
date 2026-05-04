export interface GPSData {
  time: Date;
  lat: number;
  long: number;
  temp: number;
  location?: string;
}

export interface Dataset {
  id: string;
  name: string;
  data: GPSData[];
  color: string;
  visible: boolean;
  locationCol: string | null;
  url?: string;
}
