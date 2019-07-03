import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-help-dialog',
  templateUrl: './help-dialog.component.html',
  styleUrls: ['./help-dialog.component.css']
})
export class HelpDialogComponent implements OnInit {

  constructor() { }

  ngOnInit() {
  }

  openAuthorSite(): void {
    window.open('https://hasanfalizada.github.io/', '_blank');
  }

  openRepositorySite(): void {
    window.open('https://github.com/hasanfalizada/Haalendar', '_blank');
  }
}
