import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-project-home',
  templateUrl: './project-home.component.html',
  styleUrls: ['./project-home.component.css']
})
export class ProjectHomeComponent implements OnInit {
  contributions :any[] = [];
  constructor() { }

  ngOnInit() {
    this.contributions = [{
      date: new Date(),
      amount: '$100',
      transaction: 'deposit',
      receiver: '0x000000000000'
    }, {
      date: new Date(),
      amount: '$100',
      transaction: 'withdrawal',
      receiver: '0x000000000000'
    }, {
      date: new Date(),
      amount: '$100',
      transaction: 'withdrawal',
      receiver: '0x000000000000'
    }, {
      date: new Date(),
      amount: '$100',
      transaction: 'deposit',
      receiver: '0x000000000000'
    }]
  }

}
