export interface TeamConfig {
  carCode: string;
  displayName: string;
  teamFieldValues: string[];    // Valores no campo Time (customfield_11795)
  keyPrefixes: string[];        // Prefixos de issue key
}

export interface SMConfig {
  id: string;
  name: string;
  avatar: string;               // Iniciais para avatar
  teams: TeamConfig[];
}

export const SM_CONFIGS: SMConfig[] = [
  {
    id: 'gabriela',
    name: 'Gabriela',
    avatar: 'GA',
    teams: [
      { carCode: 'SFV', displayName: 'SF Vendas', teamFieldValues: ['SFV', 'SALESFORCE VENDAS'],
        keyPrefixes: ['SFV'] },
      { carCode: 'GOL', displayName: 'Gol', teamFieldValues: ['GOL'],
        keyPrefixes: ['GOL', 'LI'] },
      { carCode: 'SALESFORCE', displayName: 'SF MktCloud · ID.4',
        teamFieldValues: ['SFMKT'],
        keyPrefixes: ['SFMKT'] },
    ]
  },
  {
    id: 'rafael',
    name: 'Rafael',
    avatar: 'RA',
    teams: [
      { carCode: 'OPTIMUS', displayName: 'Optimus', teamFieldValues: ['OPTIMUS'], 
        keyPrefixes: ['CTO'] },
      { carCode: 'NIVUS', displayName: 'Nivus', teamFieldValues: ['NIVUS'], 
        keyPrefixes: ['VAA'] },
      { carCode: 'JETTA', displayName: 'Jetta', teamFieldValues: ['JETTA'], 
        keyPrefixes: ['JETTA', 'JVE'] },
    ]
  },
  {
    id: 'ed',
    name: 'Tiago',
    avatar: 'TI',
    teams: [
      { carCode: 'SCANIA', displayName: 'Scania', teamFieldValues: ['SCANIA', 'SCANIA S 650'], 
        keyPrefixes: ['SCANIA'] },
      { carCode: 'PARATI', displayName: 'Parati', teamFieldValues: ['PARATI'],
        keyPrefixes: ['PARATI'] },
      { carCode: 'TIGUAN', displayName: 'Tiguan', teamFieldValues: ['TIGUAN'],
        keyPrefixes: ['RM', 'MAN'] },
    ]
  }
];
