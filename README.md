# Broodfonds  
## Blockchain and Decentralized Applications Project Work  
### Valerio D. Conte, Alberto Petillo

---
// Would prefer for the description to include the broodfonds are the goal, but that with the customizeablity this can be
// fitted into other usecases, such as phone insurnace, laptop insurance 
### **Broodfonds** is a mutual assistance fund for self-employed workers who fall ill or become unable to work.  
Each member contributes a monthly amount and receives donations from other members if unable to work due to illness, for a maximum of two years.  // add a reference to wikipedia

- A Broodfonds typically consists of 25 to 50 members.  
- There is a one-time entrance fee, monthly administrative fees, and a customizable monthly contribution.  
- Donations (gifts) during illness are proportional to the agreed monthly contribution.

---

## Features
// Please create mermaid sequence diagrams (chatgpt is very good at this) for the user flow 
### Users can:
- Register
- Choose their monthly contribution
- Deposit monthly contributions
- Make donations to other members
- Withdraw funds // How is it determined if you can withdraw funds? is it by vote or permissionless?
- Leave the fund // Doesn't this break all the math of the fund if it happens? 

### Fund Owners can:
- Create a new fund
- Decommission a fund
- Set the entrance and administrative fees

// Please add a section with concessions (things that are not covered/ not solved by this implementation)
// Will there be any automationn for this repo?